/**
 * Keymap editing.
 *
 * Model: read the whole keymap once on connect (`base`), edit a copy
 * (`draft`), and write only the cells that differ. Vial writes are
 * per-keycode round trips, so batching them behind one explicit
 * "書き込む" action keeps a rapid edit session from hammering the wire —
 * and gives us a natural place to run the Vial unlock chord, which the
 * firmware demands before it accepts any keymap write.
 */

import { create } from 'zustand';
import { DEMO_COLS, DEMO_LAYERS, DEMO_ROWS, demoKeymap } from '../board/demoKeymap';
import type { KeyboardLayoutDef } from '../protocol/handshake';
import { fetchKeymap, fetchLayerCount, type Keymap, setKeycode } from '../protocol/keymap';
import { fetchUnlockStatus } from '../protocol/unlock';
import { runOnDevice } from './connection';

export interface CellRef {
  layer: number;
  row: number;
  col: number;
}

export type UnlockPhase = 'unknown' | 'unlocked' | 'holding' | 'failed';

export interface UnlockState {
  phase: UnlockPhase;
  /** Matrix positions the user must hold, straight from the firmware. */
  chord: Array<{ row: number; col: number }>;
  /** Polls left in the current attempt, for the progress readout. */
  remaining: number;
}

export type KeymapPhase = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

export interface KeymapStore {
  phase: KeymapPhase;
  error: string | null;
  layer: number;
  layerCount: number;
  rows: number;
  cols: number;
  /** Last known device contents. */
  base: Keymap | null;
  /** Local working copy. */
  draft: Keymap | null;
  /** `${layer},${row},${col}` for every locally-changed cell. */
  dirty: ReadonlySet<string>;
  unlock: UnlockState;
  /** True when the contents are the offline sample, not a real device. */
  demo: boolean;

  load: (definition: KeyboardLayoutDef) => Promise<void>;
  /** Populate from the built-in sample so the editor works with no hardware. */
  loadDemo: () => void;
  reset: () => void;
  setLayer: (layer: number) => void;
  setKey: (cell: CellRef, code: number) => void;
  revertCell: (cell: CellRef) => void;
  discardEdits: () => void;
  save: () => Promise<void>;
}

const cellId = (c: CellRef) => `${c.layer},${c.row},${c.col}`;

function cloneKeymap(km: Keymap): Keymap {
  return km.map((layer) => layer.map((row) => [...row]));
}

const IDLE_UNLOCK: UnlockState = { phase: 'unknown', chord: [], remaining: 0 };

export const useKeymapStore = create<KeymapStore>((set, get) => ({
  phase: 'idle',
  error: null,
  layer: 0,
  layerCount: 0,
  rows: 4,
  cols: 10,
  base: null,
  draft: null,
  dirty: new Set<string>(),
  unlock: IDLE_UNLOCK,
  demo: false,

  loadDemo: () => {
    const keymap = demoKeymap();
    set({
      phase: 'ready',
      error: null,
      demo: true,
      layer: 0,
      layerCount: DEMO_LAYERS,
      rows: DEMO_ROWS,
      cols: DEMO_COLS,
      base: keymap,
      draft: cloneKeymap(keymap),
      dirty: new Set<string>(),
      unlock: { phase: 'unlocked', chord: [], remaining: 0 },
    });
  },

  load: async (definition) => {
    set({ phase: 'loading', error: null });
    try {
      const { rows, cols } = definition.matrix;
      const result = await runOnDevice(async (t) => {
        const layers = await fetchLayerCount(t);
        const keymap = await fetchKeymap(t, { layers, rows, cols });
        // Cheap and useful: knowing up front whether the board is locked
        // lets the UI explain the chord before the user hits 書き込む.
        const status = await fetchUnlockStatus(t);
        return { layers, keymap, status };
      });
      set((s) => ({
        phase: 'ready',
        rows,
        cols,
        layerCount: result.layers,
        base: result.keymap,
        draft: cloneKeymap(result.keymap),
        dirty: new Set<string>(),
        layer: Math.min(s.layer, Math.max(result.layers - 1, 0)),
        unlock: {
          phase: result.status.unlocked ? 'unlocked' : 'unknown',
          chord: result.status.chord,
          remaining: 0,
        },
      }));
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  reset: () => {
    set({
      phase: 'idle',
      error: null,
      base: null,
      draft: null,
      dirty: new Set<string>(),
      layerCount: 0,
      unlock: IDLE_UNLOCK,
      demo: false,
    });
  },

  setLayer: (layer) => {
    const { layerCount } = get();
    if (layer < 0 || (layerCount > 0 && layer >= layerCount)) return;
    set({ layer });
  },

  setKey: (cell, code) => {
    const { draft, base } = get();
    if (!draft || !base) return;
    const current = draft[cell.layer]?.[cell.row]?.[cell.col];
    if (current === undefined || current === code) return;

    const next = cloneKeymap(draft);
    const row = next[cell.layer]?.[cell.row];
    if (!row) return;
    row[cell.col] = code;

    const dirty = new Set(get().dirty);
    const original = base[cell.layer]?.[cell.row]?.[cell.col];
    if (original === code) dirty.delete(cellId(cell));
    else dirty.add(cellId(cell));
    set({ draft: next, dirty });
  },

  revertCell: (cell) => {
    const original = get().base?.[cell.layer]?.[cell.row]?.[cell.col];
    if (original === undefined) return;
    get().setKey(cell, original);
  },

  discardEdits: () => {
    const { base } = get();
    if (!base) return;
    set({ draft: cloneKeymap(base), dirty: new Set<string>() });
  },

  save: async () => {
    const { draft, dirty, demo } = get();
    if (!draft || dirty.size === 0) return;
    if (demo) {
      set({ error: 'デモ表示中です。実機を接続すると書き込めます。' });
      return;
    }
    set({ phase: 'saving', error: null });

    const cells: CellRef[] = [...dirty].map((id) => {
      const [layer = '0', row = '0', col = '0'] = id.split(',');
      return { layer: Number(layer), row: Number(row), col: Number(col) };
    });

    try {
      await runOnDevice(async (t) => {
        /*
         * No unlock chord here, deliberately. Vial's convention is to
         * unlock before touching the keymap, but rmk 0.8.2 gates exactly
         * one thing on the lock — the `SwitchMatrixState` reply read by
         * the 通電テスト panel (`host/via/mod.rs:140`, the only
         * `is_unlocked()` call site in the crate). `DynamicKeymapSetKeyCode`
         * writes straight through, so demanding a two-handed chord before
         * every save would cost the user something and buy nothing.
         *
         * We still record the lock state for display; if a future rmk
         * starts gating writes, they will fail loudly here rather than
         * silently, because the firmware echoes the request back.
         */
        const status = await fetchUnlockStatus(t);
        set((s) => ({
          unlock: {
            ...s.unlock,
            phase: status.unlocked ? 'unlocked' : 'unknown',
            chord: status.chord,
          },
        }));

        for (const cell of cells) {
          const code = draft[cell.layer]?.[cell.row]?.[cell.col];
          if (code === undefined) continue;
          await setKeycode(t, cell.layer, cell.row, cell.col, code);
        }
      });

      // Writes landed — the draft is now what the device holds.
      set({ phase: 'ready', base: cloneKeymap(draft), dirty: new Set<string>() });
    } catch (err) {
      set({
        phase: 'ready',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));

/*
 * Derivations take the raw `dirty` set rather than the whole store, because
 * they allocate: subscribing a component to `(s) => derive(s)` would hand
 * zustand a fresh object every render and loop forever. Callers pass
 * `state.dirty` (a stable reference between updates) through useMemo.
 */

/** `row,col` ids dirty on the given layer — what the board view highlights. */
export function dirtyOnLayer(dirty: ReadonlySet<string>, layer: number): ReadonlySet<string> {
  const out = new Set<string>();
  for (const id of dirty) {
    const [l, row, col] = id.split(',');
    if (Number(l) === layer) out.add(`${row},${col}`);
  }
  return out;
}

/** Layer indices that have at least one unwritten edit. */
export function dirtyLayers(dirty: ReadonlySet<string>): ReadonlySet<number> {
  const out = new Set<number>();
  for (const id of dirty) {
    const [l] = id.split(',');
    out.add(Number(l));
  }
  return out;
}
