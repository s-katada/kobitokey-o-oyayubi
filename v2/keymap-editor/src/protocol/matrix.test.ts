/**
 * The decoder is checked against an independent model of the firmware:
 * `encodeLikeFirmware` is a line-by-line transcription of rmk 0.8.2's
 * `MatrixState::update` + `MatrixState::read_all` (`src/matrix.rs`). If
 * either side of the bit layout is wrong the round trip breaks, which is
 * exactly the failure we cannot afford — a mis-decoded bitmap would
 * report working keys as dead.
 */

import { describe, expect, it } from 'vitest';
import {
  buildGetSwitchMatrixState,
  MATRIX_STATE_OFFSET,
  type MatrixDims,
  matrixStateFits,
  parseSwitchMatrixState,
  readMatrixBit,
  rowStride,
  ViaKeyboardInfo,
} from './matrix';

const KOBU2: MatrixDims = { rows: 4, cols: 10 };

function encodeLikeFirmware(
  pressed: ReadonlyArray<readonly [number, number]>,
  dims: MatrixDims,
): Uint8Array {
  const stride = rowStride(dims.cols);
  // `MatrixState::update`: one bit at `row * ROW_LEN * 8 + col`.
  const state = new Uint8Array(30);
  for (const [row, col] of pressed) {
    const index = row * stride * 8 + col;
    state[index >> 3] = (state[index >> 3] ?? 0) | (1 << (index & 7));
  }
  // `MatrixState::read_all`: rows in order, bytes reversed within a row.
  const reply = new Uint8Array(32);
  reply[0] = 0x02;
  reply[1] = 0x03;
  let out = MATRIX_STATE_OFFSET;
  for (let row = 0; row < dims.rows; row++) {
    for (let i = stride - 1; i >= 0; i--) {
      reply[out++] = state[row * stride + i] ?? 0;
    }
  }
  return reply;
}

describe('switch matrix state', () => {
  it('asks for the right Via command', () => {
    const p = buildGetSwitchMatrixState();
    expect(p[0]).toBe(0x02);
    expect(p[1]).toBe(ViaKeyboardInfo.SwitchMatrixState);
    expect(p.length).toBe(32);
  });

  it('uses rmk’s row stride, not ceil(cols / 8)', () => {
    expect(rowStride(10)).toBe(2);
    expect(rowStride(5)).toBe(1);
    // Where the two formulas disagree, rmk's answer is the one on the wire.
    expect(rowStride(8)).toBe(2);
    expect(rowStride(16)).toBe(3);
  });

  it('confirms kobu2 fits the firmware’s 30-byte bitmap', () => {
    expect(matrixStateFits(KOBU2)).toBe(true);
    expect(matrixStateFits({ rows: 4, cols: 10 })).toBe(true);
    expect(matrixStateFits({ rows: 20, cols: 20 })).toBe(false);
  });

  it('round-trips every position on the kobu2 matrix', () => {
    for (let row = 0; row < KOBU2.rows; row++) {
      for (let col = 0; col < KOBU2.cols; col++) {
        const reply = encodeLikeFirmware([[row, col]], KOBU2);
        expect([...parseSwitchMatrixState(reply, KOBU2)]).toEqual([`${row},${col}`]);
      }
    }
  });

  it('round-trips several keys held at once', () => {
    const held = [
      [0, 0],
      [0, 9],
      [3, 4],
      [3, 5],
      [2, 3],
    ] as const;
    const reply = encodeLikeFirmware(held, KOBU2);
    const pressed = parseSwitchMatrixState(reply, KOBU2);
    expect(pressed.size).toBe(held.length);
    for (const [row, col] of held) expect(pressed.has(`${row},${col}`)).toBe(true);
  });

  /*
   * Pinning the concrete bytes as well as the round trip: if rmk ever
   * changes `read_all`'s byte order, the model above would change with
   * it and the round-trip test alone would keep passing.
   */
  it('reads the documented byte layout for kobu2', () => {
    const reply = new Uint8Array(32);
    reply[3] = 0b0000_0001; // row 0, cols 0..7 byte, bit 0
    reply[2] = 0b0000_0010; // row 0, cols 8..9 byte, bit 1 = col 9
    reply[9] = 0b0010_0000; // row 3, cols 0..7 byte, bit 5

    const pressed = parseSwitchMatrixState(reply, KOBU2);
    expect([...pressed].sort()).toEqual(['0,0', '0,9', '3,5']);
    expect(readMatrixBit(reply, 0, 0, KOBU2.cols)).toBe(true);
    expect(readMatrixBit(reply, 0, 1, KOBU2.cols)).toBe(false);
    expect(readMatrixBit(reply, 0, 9, KOBU2.cols)).toBe(true);
  });

  it('reads a locked board (all-zero payload) as nothing pressed', () => {
    // A locked board never writes the payload, so the reply is just the
    // echoed request. That must decode as "no keys down", not as garbage.
    const reply = new Uint8Array(32);
    reply[0] = 0x02;
    reply[1] = 0x03;
    expect(parseSwitchMatrixState(reply, KOBU2).size).toBe(0);
  });

  it('treats a short reply as nothing pressed rather than throwing', () => {
    expect(parseSwitchMatrixState(new Uint8Array(2), KOBU2).size).toBe(0);
  });
});
