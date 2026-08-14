/**
 * 通電テスト — polls the firmware's raw switch bitmap so every key can be
 * proven to reach the MCU.
 *
 * Why not just watch what the keyboard types: because a key that types
 * nothing is exactly the case worth testing. The bitmap comes from
 * `matrix_state`, which rmk updates *before* any keymap lookup, so layer
 * keys, modifiers and unmapped positions all register — and a key that
 * never appears has an electrical fault (switch, socket, FFC, MCU pin)
 * rather than a keymap problem.
 *
 * Two firmware facts shape the flow:
 *
 *   * the reply is only filled in on an **unlocked** board (a locked one
 *     silently reads as "nothing pressed"), so a session starts by
 *     running the Vial unlock chord;
 *   * the bitmap lives on the **central**, fed by both its own matrix and
 *     the events the peripheral forwards over BLE — so the right half
 *     only answers while the split link is up.
 */

import { create } from 'zustand';
import { fetchMatrixState, type MatrixDims, matrixKeyId } from '../protocol/matrix';
import { DEFAULT_POLL_BUDGET, fetchUnlockStatus, performUnlock } from '../protocol/unlock';
import { runOnDevice } from './connection';

/**
 * Poll period. A deliberate press lasts far longer than this, and each
 * poll is one 32-byte HID round trip on a wire that is otherwise idle
 * while the panel is open.
 */
export const POLL_INTERVAL_MS = 40;

/** How long a simulated press stays lit in demo mode. */
const DEMO_PRESS_MS = 180;

export type MatrixTestPhase = 'idle' | 'unlocking' | 'running' | 'error';

export interface MatrixTestStore {
  phase: MatrixTestPhase;
  error: string | null;
  /** Switches closed at this instant. */
  pressed: ReadonlySet<string>;
  /** Switches seen closed at least once since the last clear. */
  seen: ReadonlySet<string>;
  /** Positions the firmware wants held to unlock, for the prompt. */
  chord: Array<{ row: number; col: number }>;
  /** Polls left in the current unlock attempt. */
  unlockRemaining: number;
  /** Chord keys the firmware still sees as up. Live feedback while holding. */
  chordKeysRemaining: number;
  /** Successful reads this session — visible proof the link is alive. */
  polls: number;
  /** True when nothing is attached and presses are simulated by clicking. */
  demo: boolean;

  /** Unlock if needed, then start polling. */
  start: (dims: MatrixDims) => Promise<void>;
  stop: () => void;
  /** Offline: let the board view be exercised with no hardware. */
  startDemo: () => void;
  /** Demo only — pretend the given key was pressed. */
  demoPress: (row: number, col: number) => void;
  /** Forget which keys have been proven, keep testing. */
  clearSeen: () => void;
  /** Stop and drop everything (disconnect / tab change). */
  reset: () => void;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

/**
 * Cancellation token. Every loop captures the value it started with and
 * bails as soon as it changes, so stop/start/disconnect can never leave
 * two loops writing to the same store.
 */
let session = 0;
const demoTimers = new Map<string, ReturnType<typeof setTimeout>>();

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'unlock-timeout') {
      return 'ロック解除できませんでした。左右いちばん外側の小指キーを同時に押したまま、もう一度お試しください（解除キーは左右に 1 つずつなので、右半分の電源が入っていないと解除できません）。';
    }
    if (err.message === 'cancelled') return '';
    return err.message;
  }
  return String(err);
}

export const useMatrixTestStore = create<MatrixTestStore>((set, get) => ({
  phase: 'idle',
  error: null,
  pressed: EMPTY,
  seen: EMPTY,
  chord: [],
  unlockRemaining: 0,
  chordKeysRemaining: 0,
  polls: 0,
  demo: false,

  start: async (dims) => {
    if (get().phase === 'running' || get().phase === 'unlocking') return;
    const token = ++session;
    set({ phase: 'unlocking', error: null, demo: false, pressed: EMPTY, polls: 0 });

    try {
      // The unlock dance stays inside one queued slot so nothing else can
      // slip onto the wire between UnlockStart and the poll that clears it.
      await runOnDevice(async (t) => {
        const status = await fetchUnlockStatus(t);
        set({ chord: status.chord });
        if (status.unlocked) return;
        set({ unlockRemaining: DEFAULT_POLL_BUDGET, chordKeysRemaining: status.chord.length });
        await performUnlock(t, {
          onTick: (result, ticksRemaining) =>
            set({ unlockRemaining: ticksRemaining, chordKeysRemaining: result.keysRemaining }),
        });
      });
    } catch (err) {
      if (session !== token) return;
      set({ phase: 'error', error: describeError(err), unlockRemaining: 0, chordKeysRemaining: 0 });
      return;
    }

    if (session !== token) return;
    set({ phase: 'running', unlockRemaining: 0, chordKeysRemaining: 0 });
    void pollLoop(token, dims);
  },

  stop: () => {
    session++;
    set({ phase: 'idle', pressed: EMPTY, unlockRemaining: 0, chordKeysRemaining: 0 });
  },

  startDemo: () => {
    session++;
    set({
      phase: 'running',
      demo: true,
      error: null,
      pressed: EMPTY,
      seen: EMPTY,
      chord: [],
      unlockRemaining: 0,
      chordKeysRemaining: 0,
      polls: 0,
    });
  },

  demoPress: (row, col) => {
    if (!get().demo || get().phase !== 'running') return;
    const id = matrixKeyId(row, col);
    set((s) => ({
      pressed: new Set(s.pressed).add(id),
      seen: new Set(s.seen).add(id),
      polls: s.polls + 1,
    }));
    const existing = demoTimers.get(id);
    if (existing) clearTimeout(existing);
    demoTimers.set(
      id,
      setTimeout(() => {
        demoTimers.delete(id);
        set((s) => {
          const pressed = new Set(s.pressed);
          pressed.delete(id);
          return { pressed };
        });
      }, DEMO_PRESS_MS),
    );
  },

  clearSeen: () => set({ seen: EMPTY, error: null }),

  reset: () => {
    session++;
    for (const timer of demoTimers.values()) clearTimeout(timer);
    demoTimers.clear();
    set({
      phase: 'idle',
      error: null,
      pressed: EMPTY,
      seen: EMPTY,
      chord: [],
      unlockRemaining: 0,
      chordKeysRemaining: 0,
      polls: 0,
      demo: false,
    });
  },
}));

/**
 * Read the bitmap until something stops us. A failed read ends the
 * session with the error showing: mid-test the usual cause is the USB
 * cable, and silently retrying would look like a dead half.
 */
async function pollLoop(token: number, dims: MatrixDims): Promise<void> {
  const set = useMatrixTestStore.setState;
  while (session === token) {
    try {
      const pressed = await runOnDevice((t) => fetchMatrixState(t, dims));
      if (session !== token) return;
      set((s) => ({
        pressed,
        // `seen` only ever grows: a key that answered once is proven, and
        // the user needs both hands free to reach the far thumb keys.
        seen: pressed.size === 0 ? s.seen : new Set([...s.seen, ...pressed]),
        polls: s.polls + 1,
      }));
    } catch (err) {
      if (session !== token) return;
      session++;
      set({ phase: 'error', error: describeError(err), pressed: EMPTY });
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Positions that exist on the board but have not answered yet. */
export function untestedKeys(
  keys: ReadonlyArray<{ row: number; col: number }>,
  seen: ReadonlySet<string>,
): Array<{ row: number; col: number }> {
  return keys.filter((k) => !seen.has(matrixKeyId(k.row, k.col)));
}
