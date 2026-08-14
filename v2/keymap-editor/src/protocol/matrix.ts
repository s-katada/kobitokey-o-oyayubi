/**
 * Live switch-matrix state — the wire behind the 通電テスト panel.
 *
 * This is Via's `GetKeyboardValue (0x02)` with sub-id
 * `SwitchMatrixState (0x03)`: the firmware answers with a bitmap of
 * every switch that is closed *right now*, before any keymap lookup.
 * That is what makes it a continuity test rather than a typing test —
 * a key with no keycode, a layer key, or a key on a half whose keymap
 * is wrong all still show up, and a key that never appears has an
 * electrical fault between the switch and the MCU.
 *
 * Firmware side (`rmk-0.8.2`, all present in the shipped kobu2 build —
 * `vial_lock` is one of rmk's *default* features and `firmware/Cargo.toml`
 * does not disable defaults):
 *
 *   * `keyboard.rs::process_inner` calls `matrix_state.update(&event)`
 *     for every key event, including the ones the split peripheral
 *     forwards over BLE — so the central's bitmap covers both halves,
 *     in unified keymap coordinates (right half = `col + 5`).
 *   * `host/via/mod.rs` answers `SwitchMatrixState` by calling
 *     `matrix_state.read_all(&mut report.input_data[2..])`, **but only
 *     when the board is unlocked**. On a locked board the reply is just
 *     the echoed request, i.e. all zeros — indistinguishable from "no
 *     key pressed". Callers must therefore unlock first; the store does.
 *
 * ## Bit layout
 *
 * `MatrixState` (rmk `src/matrix.rs`) stores one bit per switch, packed
 * `index = row * ROW_LEN * 8 + col` into a byte array, where
 * `ROW_LEN = (COL + 8) / 8` (integer division). `read_all` then emits
 * each row's bytes **reversed** — most significant byte first — which is
 * what QMK's `id_switch_matrix_state` does with `matrix_row_t`.
 *
 * For kobu2 (4 rows x 10 cols) `ROW_LEN` is 2, so each row is a
 * big-endian u16 whose bit `c` is column `c`, and the whole bitmap is
 * 8 bytes at `reply[2..10]`:
 *
 *   reply[2] = row 0, cols 8..9      reply[3] = row 0, cols 0..7
 *   reply[4] = row 1, cols 8..9      reply[5] = row 1, cols 0..7
 *   ...
 */

import { emptyPacket, type VialPacket } from '../transport/types';
import type { WebHidTransport } from '../transport/webhid';
import { ViaCommand } from './commands';

/**
 * Sub-command ids for `ViaCommand.GetKeyboardValue` (= `packet[1]`).
 * Mirrors `rmk-types-0.2.2/src/protocol/vial.rs::ViaKeyboardInfo`.
 */
export const ViaKeyboardInfo = {
  Uptime: 0x01,
  LayoutOptions: 0x02,
  SwitchMatrixState: 0x03,
  FirmwareVersion: 0x04,
} as const;

/**
 * Where the bitmap starts in the reply. rmk seeds `input_data` from
 * `output_data`, so bytes 0..2 echo `[cmd, sub-id]` and the payload
 * follows.
 */
export const MATRIX_STATE_OFFSET = 2;

/** Bytes the firmware reserves for the whole bitmap (`MatrixState::state`). */
export const MATRIX_STATE_CAPACITY = 30;

export interface MatrixDims {
  rows: number;
  cols: number;
}

/**
 * Bytes per matrix row on the wire. Deliberately rmk's own formula
 * (`(COL + 8) / 8`, integer division) rather than `ceil(cols / 8)` —
 * they differ when `cols` is an exact multiple of 8, and the firmware
 * is the one we have to agree with. kobu2 has 10 columns either way.
 */
export function rowStride(cols: number): number {
  return Math.floor((cols + 8) / 8);
}

/**
 * True when the bitmap for these dimensions fits both the firmware's
 * 30-byte buffer and the 32-byte reply packet. rmk refuses to compile a
 * board that overflows it, so this is a sanity check for our own
 * decoding rather than a case we expect to hit.
 */
export function matrixStateFits(dims: MatrixDims): boolean {
  const bytes = dims.rows * rowStride(dims.cols);
  return bytes > 0 && bytes <= MATRIX_STATE_CAPACITY;
}

/**
 * Via `GetKeyboardValue / SwitchMatrixState`.
 *
 *   packet[0] = 0x02
 *   packet[1] = 0x03
 */
export function buildGetSwitchMatrixState(): VialPacket {
  const p = emptyPacket();
  p[0] = ViaCommand.GetKeyboardValue;
  p[1] = ViaKeyboardInfo.SwitchMatrixState;
  return p;
}

/** Read one switch out of a `SwitchMatrixState` reply. */
export function readMatrixBit(reply: Uint8Array, row: number, col: number, cols: number): boolean {
  const stride = rowStride(cols);
  // `read_all` reverses the bytes within each row, so the byte holding
  // column `col` sits `stride - 1 - (col / 8)` in from the row's start.
  const offset = MATRIX_STATE_OFFSET + row * stride + (stride - 1 - (col >> 3));
  const byte = reply[offset] ?? 0;
  return (byte & (1 << (col & 7))) !== 0;
}

/** `${row},${col}` — the same key id the board view uses. */
export const matrixKeyId = (row: number, col: number) => `${row},${col}`;

/**
 * Decode a `SwitchMatrixState` reply into the set of positions that are
 * closed right now, as `row,col` ids.
 */
export function parseSwitchMatrixState(reply: Uint8Array, dims: MatrixDims): ReadonlySet<string> {
  const pressed = new Set<string>();
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      if (readMatrixBit(reply, row, col, dims.cols)) pressed.add(matrixKeyId(row, col));
    }
  }
  return pressed;
}

/** One round trip: ask the board which switches are closed. */
export async function fetchMatrixState(
  transport: WebHidTransport,
  dims: MatrixDims,
): Promise<ReadonlySet<string>> {
  const reply = await transport.sendAndReceive(buildGetSwitchMatrixState());
  return parseSwitchMatrixState(reply, dims);
}
