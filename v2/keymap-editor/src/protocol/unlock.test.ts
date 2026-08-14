/**
 * Unlock-flag polarity, pinned to the firmware source.
 *
 * This exists because the polarity was wrong once and the symptom was
 * silent: rmk sends `is_unlocked()`, the editor read it as `locked`, so a
 * freshly booted (locked) board looked unlocked, the chord was never
 * requested, and every `SwitchMatrixState` reply came back empty — which
 * is indistinguishable from "no key is pressed".
 *
 * Reference: `rmk-0.8.2/src/host/via/vial.rs`
 *
 *   GetUnlockStatus: input_data.fill(0xFF)
 *                    input_data[0] = locker.is_unlocked() as u8
 *                    input_data[1] = locker.is_unlocking() as u8
 *                    input_data[2 + i*2 ..] = unlock_keys
 *   UnlockPoll:      input_data[0] = locker.is_unlocked() as u8   // BEFORE the check
 *                    input_data[1] = locker.is_unlocking() as u8
 *                    input_data[2] = locker.check_unlock()        // chord keys still up
 */

import { describe, expect, it } from 'vitest';
import { intoVialPacket, type VialPacket } from '../transport/types';
import { parseUnlockPoll, parseUnlockStatus } from './commands';

/** Build a reply the way `GetUnlockStatus` does — 0xff everywhere first. */
function unlockStatusReply(
  isUnlocked: boolean,
  chord: ReadonlyArray<[number, number]>,
): VialPacket {
  const r = new Uint8Array(new ArrayBuffer(32)).fill(0xff);
  r[0] = isUnlocked ? 1 : 0;
  r[1] = 0;
  chord.forEach(([row, col], i) => {
    r[2 + i * 2] = row;
    r[3 + i * 2] = col;
  });
  return intoVialPacket(r);
}

describe('parseUnlockStatus', () => {
  it('reads 0 as LOCKED — the state a board boots into', () => {
    const status = parseUnlockStatus(unlockStatusReply(false, []));
    expect(status.unlocked).toBe(false);
  });

  it('reads 1 as unlocked', () => {
    expect(parseUnlockStatus(unlockStatusReply(true, [])).unlocked).toBe(true);
  });

  it('reads kobu’s chord and stops at the 0xff filler', () => {
    const status = parseUnlockStatus(
      unlockStatusReply(false, [
        [0, 0],
        [0, 9],
      ]),
    );
    expect(status.chord).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 9 },
    ]);
  });
});

describe('parseUnlockPoll', () => {
  it('reports how many chord keys are still up', () => {
    const r = new Uint8Array(new ArrayBuffer(32));
    r[0] = 0; // still locked
    r[1] = 1; // unlocking in progress
    r[2] = 2; // both chord keys up
    const poll = parseUnlockPoll(intoVialPacket(r));
    expect(poll.unlocked).toBe(false);
    expect(poll.inProgress).toBe(true);
    expect(poll.keysRemaining).toBe(2);
  });

  it('still reports locked on the poll that completes the chord', () => {
    // The firmware writes byte 0 before running check_unlock(), so the
    // flip only shows on the NEXT poll. Callers must wait for byte 0.
    const r = new Uint8Array(new ArrayBuffer(32));
    r[0] = 0;
    r[1] = 1;
    r[2] = 0; // chord complete — but byte 0 was already written
    const poll = parseUnlockPoll(intoVialPacket(r));
    expect(poll.keysRemaining).toBe(0);
    expect(poll.unlocked).toBe(false);
  });

  it('reports unlocked once the firmware has flipped', () => {
    const r = new Uint8Array(new ArrayBuffer(32));
    r[0] = 1;
    const poll = parseUnlockPoll(intoVialPacket(r));
    expect(poll.unlocked).toBe(true);
  });
});
