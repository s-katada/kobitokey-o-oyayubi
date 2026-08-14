/**
 * The poll loop, driven against a scripted device.
 *
 * `runOnDevice` is the only thing stubbed — the unlock handshake and the
 * bitmap decode run for real against canned replies, so this covers the
 * two behaviours the panel depends on: `seen` only ever grows, and
 * stopping actually stops the wire.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { intoVialPacket, type VialPacket } from '../transport/types';

const sendAndReceive = vi.fn<(packet: VialPacket) => Promise<VialPacket>>();

vi.mock('./connection', () => ({
  runOnDevice: (fn: (t: unknown) => Promise<unknown>) => fn({ sendAndReceive }),
}));

const { useMatrixTestStore } = await import('./matrixTest');

const DIMS = { rows: 4, cols: 10 };
const store = () => useMatrixTestStore.getState();

function reply(fill?: (r: Uint8Array) => void): VialPacket {
  const r = new Uint8Array(new ArrayBuffer(32));
  fill?.(r);
  return intoVialPacket(r);
}

/** Encode a bitmap the way rmk's `MatrixState::read_all` does. */
function matrixReply(pressed: ReadonlyArray<readonly [number, number]>): VialPacket {
  return reply((r) => {
    const stride = 2;
    const state = new Uint8Array(30);
    for (const [row, col] of pressed) {
      const index = row * stride * 8 + col;
      state[index >> 3] = (state[index >> 3] ?? 0) | (1 << (index & 7));
    }
    let out = 2;
    for (let row = 0; row < DIMS.rows; row++) {
      for (let i = stride - 1; i >= 0; i--) r[out++] = state[row * stride + i] ?? 0;
    }
  });
}

/**
 * A stand-in for the firmware, modelled on `rmk-0.8.2/src/host/via/`:
 *
 *   * unlock replies carry `is_unlocked()` in byte 0 (**1 = unlocked**);
 *   * `UnlockPoll` writes that byte BEFORE evaluating the chord, so the
 *     unlock only becomes visible on the following poll;
 *   * `SwitchMatrixState` writes nothing at all while locked, leaving the
 *     echoed request in the reply — the silent failure this whole test
 *     file exists to catch.
 *
 * `chordAfterPolls` is how many polls the simulated user takes to get
 * both keys down.
 */
function scriptDevice(options: {
  locked: boolean;
  frames: Array<Array<readonly [number, number]>>;
  chordAfterPolls?: number;
}) {
  let frame = 0;
  let polls = 0;
  let unlocked = !options.locked;
  const chordAfterPolls = options.chordAfterPolls ?? 2;

  sendAndReceive.mockImplementation(async (packet) => {
    // Vial GetUnlockStatus — buffer is 0xff-filled, then flags + chord.
    if (packet[0] === 0xfe && packet[1] === 0x05) {
      return reply((r) => {
        r.fill(0xff);
        r[0] = unlocked ? 1 : 0;
        r[1] = 0;
        r[2] = 0; // chord: (0,0)
        r[3] = 0;
        r[4] = 0; // chord: (0,9)
        r[5] = 9;
      });
    }
    // Vial UnlockStart
    if (packet[0] === 0xfe && packet[1] === 0x06) return reply();
    // Vial UnlockPoll
    if (packet[0] === 0xfe && packet[1] === 0x07) {
      const wasUnlocked = unlocked;
      polls++;
      const keysUp = polls >= chordAfterPolls ? 0 : 2;
      if (keysUp === 0) unlocked = true;
      return reply((r) => {
        r[0] = wasUnlocked ? 1 : 0;
        r[1] = 1;
        r[2] = keysUp;
      });
    }
    // Via GetKeyboardValue / SwitchMatrixState
    if (packet[0] === 0x02 && packet[1] === 0x03) {
      // Locked: rmk skips read_all entirely and the echoed request stands.
      if (!unlocked) return reply((r) => r.set(packet.subarray(0, 2)));
      const held = options.frames[Math.min(frame, options.frames.length - 1)] ?? [];
      frame++;
      return matrixReply(held);
    }
    return reply();
  });
}

/** Vial sub-command id of every packet the device was asked. */
const sentSubCommands = () =>
  sendAndReceive.mock.calls.map(([p]) => `${p[0]?.toString(16)}:${p[1]?.toString(16)}`);

describe('matrix test store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendAndReceive.mockReset();
    store().reset();
  });

  afterEach(() => {
    store().reset();
    vi.useRealTimers();
  });

  it('polls an unlocked board and accumulates every key it sees', async () => {
    scriptDevice({
      locked: false,
      frames: [[[0, 0]], [], [[3, 9]], []],
    });

    await store().start(DIMS);
    expect(store().phase).toBe('running');

    await vi.advanceTimersByTimeAsync(200);
    store().stop();

    // Union of both frames, even though neither was held at the same time.
    expect([...store().seen].sort()).toEqual(['0,0', '3,9']);
    // Nothing is held once the last frame comes back empty.
    expect(store().pressed.size).toBe(0);
    expect(store().polls).toBeGreaterThanOrEqual(3);
  });

  /*
   * The regression guard. A locked board reports byte 0 = 0; if that is
   * ever read as "unlocked" again, the chord is skipped, the firmware
   * refuses to fill the bitmap, and the panel shows a keyboard where
   * nothing at all responds — while typing works perfectly.
   */
  it('runs the unlock chord first when the board is locked', async () => {
    scriptDevice({ locked: true, frames: [[[1, 1]]] });

    const started = store().start(DIMS);
    expect(store().phase).toBe('unlocking');
    await vi.advanceTimersByTimeAsync(1000);
    await started;

    expect(store().phase).toBe('running');
    expect(store().chord).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 9 },
    ]);
    expect(sentSubCommands()).toContain('fe:6'); // UnlockStart was issued
    expect(sentSubCommands()).toContain('fe:7'); // ...and polled

    // And the bitmap is actually populated once unlocked.
    await vi.advanceTimersByTimeAsync(200);
    expect(store().seen.has('1,1')).toBe(true);
    store().stop();
  });

  it('skips the chord when the board is already unlocked', async () => {
    scriptDevice({ locked: false, frames: [[]] });

    await store().start(DIMS);

    expect(store().phase).toBe('running');
    expect(sentSubCommands()).not.toContain('fe:6');
    store().stop();
  });

  it('stops talking to the device after stop()', async () => {
    scriptDevice({ locked: false, frames: [[[1, 1]]] });

    await store().start(DIMS);
    await vi.advanceTimersByTimeAsync(100);
    store().stop();
    const callsAtStop = sendAndReceive.mock.calls.length;

    await vi.advanceTimersByTimeAsync(500);
    expect(sendAndReceive.mock.calls.length).toBe(callsAtStop);
    expect(store().phase).toBe('idle');
  });

  it('surfaces a mid-test transport failure instead of looking like a dead half', async () => {
    scriptDevice({ locked: false, frames: [[]] });
    await store().start(DIMS);

    // Cable pulled while the test is running.
    sendAndReceive.mockRejectedValue(new Error('kobu did not reply within timeout'));
    await vi.advanceTimersByTimeAsync(200);

    expect(store().phase).toBe('error');
    expect(store().error).toMatch(/timeout/);
    // And the loop gave up rather than retrying against a dead transport.
    const callsAtFailure = sendAndReceive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(sendAndReceive.mock.calls.length).toBe(callsAtFailure);
  });

  it('simulates presses in demo mode', async () => {
    store().startDemo();
    store().demoPress(2, 7);

    expect(store().pressed.has('2,7')).toBe(true);
    expect(store().seen.has('2,7')).toBe(true);

    await vi.advanceTimersByTimeAsync(300);
    expect(store().pressed.has('2,7')).toBe(false);
    // The record of the press survives the flash.
    expect(store().seen.has('2,7')).toBe(true);
  });

  it('clears the record without ending the session', async () => {
    store().startDemo();
    store().demoPress(0, 0);
    store().clearSeen();

    expect(store().seen.size).toBe(0);
    expect(store().phase).toBe('running');
  });
});
