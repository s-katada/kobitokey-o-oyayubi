/**
 * `KeyboardEvent.code` → HID keyboard usage id.
 *
 * Powers the picker's "キー入力で設定" mode: press the key you want on any
 * keyboard attached to the computer and the editor assigns the matching
 * keycode. `code` is used rather than `key` because it reports the
 * physical position and so is independent of the host's active layout.
 *
 * Values are USB HID Keyboard/Keypad page (0x07) usage ids, which is
 * exactly what Via puts on the wire for a plain keycode.
 */

const MAP: Record<string, number> = {
  // Letters — KeyA..KeyZ are contiguous from 0x04.
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, 0x04 + i]),
  ),
  // Digits — HID orders them 1..9 then 0.
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`Digit${i + 1}`, 0x1e + i])),
  Digit0: 0x27,

  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  Minus: 0x2d,
  Equal: 0x2e,
  BracketLeft: 0x2f,
  BracketRight: 0x30,
  Backslash: 0x31,
  Semicolon: 0x33,
  Quote: 0x34,
  Backquote: 0x35,
  Comma: 0x36,
  Period: 0x37,
  Slash: 0x38,
  CapsLock: 0x39,

  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 0x3a + i])),

  PrintScreen: 0x46,
  ScrollLock: 0x47,
  Pause: 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  Delete: 0x4c,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,

  NumLock: 0x53,
  NumpadDivide: 0x54,
  NumpadMultiply: 0x55,
  NumpadSubtract: 0x56,
  NumpadAdd: 0x57,
  NumpadEnter: 0x58,
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`Numpad${i + 1}`, 0x59 + i])),
  Numpad0: 0x62,
  NumpadDecimal: 0x63,

  // JIS extras. macOS reports 英数 / かな as Lang2 / Lang1 in Chromium.
  IntlRo: 0x87,
  IntlYen: 0x89,
  Convert: 0x8a,
  NonConvert: 0x8b,
  Lang1: 0x90,
  Lang2: 0x91,

  ControlLeft: 0xe0,
  ShiftLeft: 0xe1,
  AltLeft: 0xe2,
  MetaLeft: 0xe3,
  ControlRight: 0xe4,
  ShiftRight: 0xe5,
  AltRight: 0xe6,
  MetaRight: 0xe7,
};

/** HID usage for a DOM `KeyboardEvent.code`, or undefined if unmapped. */
export function hidCodeForEventCode(code: string): number | undefined {
  return MAP[code];
}
