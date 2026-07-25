/**
 * Sample keymap for the offline demo.
 *
 * Layer 0 is transcribed from the shipping `v2/firmware/rmk/keyboard.toml`
 * so the board looks like a real kobu2 the moment you open the page — handy
 * before the hardware is assembled, and for showing the editor to someone
 * without plugging a keyboard in. The remaining layers are left transparent:
 * the demo is explicitly labelled as sample data rather than pretending to
 * mirror the firmware layer for layer.
 *
 * Nothing here is ever written to a device — demo mode has no transport.
 */

import {
  BASE_CATALOGUE,
  encodeLT,
  encodeMT,
  KC_TRANSPARENT,
  MOD_ALT,
  MOD_CTRL,
  MOD_GUI,
  MOD_SHIFT,
} from '../protocol/keycodes';
import type { Keymap } from '../protocol/keymap';

const BY_NAME = new Map(BASE_CATALOGUE.map((m) => [m.name, m.code]));

/** Catalogue lookup by canonical name; throws so a typo fails a test, not a user. */
function kc(name: string): number {
  const code = BY_NAME.get(name);
  if (code === undefined) throw new Error(`demoKeymap: unknown keycode "${name}"`);
  return code;
}

export const DEMO_LAYERS = 7;
export const DEMO_ROWS = 4;
export const DEMO_COLS = 10;

/** Layer 0 of `v2/firmware/rmk/keyboard.toml`, cell for cell. */
function layerZero(): number[][] {
  return [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map(kc),
    [
      ...['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map(kc),
      encodeMT(kc('Semicolon'), MOD_GUI | MOD_SHIFT),
    ],
    [
      ...['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Dot'].map(kc),
      encodeMT(kc('Slash'), MOD_GUI | MOD_CTRL),
    ],
    [
      // (3,0) and (3,9) are v2's extra bottom-pinky keys.
      kc('LShift'),
      kc('LGui'),
      kc('LCtrl'),
      encodeMT(kc('Language2'), MOD_SHIFT),
      kc('Backspace'),
      kc('Backspace'),
      encodeMT(kc('Escape'), MOD_ALT),
      encodeLT(2, kc('Space')),
      encodeLT(3, kc('Enter')),
      kc('RShift'),
    ],
  ];
}

export function demoKeymap(): Keymap {
  const transparent = () =>
    Array.from({ length: DEMO_ROWS }, () =>
      Array.from({ length: DEMO_COLS }, () => KC_TRANSPARENT),
    );
  return [layerZero(), ...Array.from({ length: DEMO_LAYERS - 1 }, () => transparent())];
}
