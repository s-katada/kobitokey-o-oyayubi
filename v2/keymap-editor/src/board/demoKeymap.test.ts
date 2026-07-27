import { describe, expect, it } from 'vitest';
import {
  BASE_CATALOGUE,
  decodeKeycode,
  KC_TRANSPARENT,
  labelForKeycode,
} from '../protocol/keycodes';
import { DEMO_COLS, DEMO_LAYERS, DEMO_ROWS, demoKeymap } from './demoKeymap';

const codeOf = (name: string) => BASE_CATALOGUE.find((m) => m.name === name)?.code;

describe('demo keymap', () => {
  it('builds without hitting an unknown keycode name', () => {
    expect(() => demoKeymap()).not.toThrow();
  });

  it('has the firmware layer/matrix dimensions', () => {
    const km = demoKeymap();
    expect(km).toHaveLength(DEMO_LAYERS);
    for (const layer of km) {
      expect(layer).toHaveLength(DEMO_ROWS);
      for (const row of layer) expect(row).toHaveLength(DEMO_COLS);
    }
  });

  it('reproduces the QWERTY home row of keyboard.toml layer 0', () => {
    const km = demoKeymap();
    const row0 = km[0]?.[0];
    expect(row0?.slice(0, 5)).toEqual(['Q', 'W', 'E', 'R', 'T'].map(codeOf));
    expect(row0?.slice(5)).toEqual(['Y', 'U', 'I', 'O', 'P'].map(codeOf));
  });

  it('puts a plain Shift on each of v2’s extra bottom-pinky keys', () => {
    const km = demoKeymap();
    expect(km[0]?.[3]?.[0]).toBe(codeOf('LShift'));
    expect(km[0]?.[3]?.[9]).toBe(codeOf('RShift'));
  });

  it('encodes the tap-hold thumbs the way the firmware spells them', () => {
    const km = demoKeymap();
    // (3,3) = MT(Language2, LShift) — tap 英数, hold Shift.
    const lang = km[0]?.[3]?.[3];
    expect(lang).toBeDefined();
    const decoded = decodeKeycode(lang ?? 0);
    expect(decoded.kind).toBe('mt');
    if (decoded.kind === 'mt') expect(decoded.kc).toBe(codeOf('Language2'));
    // (3,7) = LT(2, Space).
    const space = decodeKeycode(km[0]?.[3]?.[7] ?? 0);
    expect(space.kind).toBe('lt');
    if (space.kind === 'lt') {
      expect(space.layer).toBe(2);
      expect(space.kc).toBe(codeOf('Space'));
    }
  });

  it('leaves every layer above 0 transparent', () => {
    const km = demoKeymap();
    for (const layer of km.slice(1)) {
      for (const row of layer) {
        for (const code of row) expect(code).toBe(KC_TRANSPARENT);
      }
    }
  });

  it('renders a legend for every cell of layer 0', () => {
    const km = demoKeymap();
    for (const row of km[0] ?? []) {
      for (const code of row) {
        expect(labelForKeycode(code).center.length).toBeGreaterThan(0);
      }
    }
  });
});
