import { describe, expect, it } from 'vitest';
import { KOBU2_BOARD } from './geometry';
import { positionLabel } from './positionLabel';

describe('positionLabel', () => {
  it('names the letter rows by side, row and finger', () => {
    expect(positionLabel(0, 0)).toBe('左 上段 小指');
    expect(positionLabel(1, 2)).toBe('左 中段 中指');
    expect(positionLabel(2, 4)).toBe('左 下段 人差し指（内）');
    expect(positionLabel(0, 9)).toBe('右 上段 小指');
    expect(positionLabel(1, 5)).toBe('右 中段 人差し指（内）');
  });

  it('calls out v2’s extra key rather than treating it as a thumb', () => {
    expect(positionLabel(3, 0)).toBe('左 小指 最下段');
    expect(positionLabel(3, 9)).toBe('右 小指 最下段');
  });

  it('numbers the thumbs inward-out on both halves', () => {
    expect(positionLabel(3, 4)).toBe('左 親指1（最内）');
    expect(positionLabel(3, 1)).toBe('左 親指4（最外）');
    expect(positionLabel(3, 5)).toBe('右 親指1（最内）');
    expect(positionLabel(3, 8)).toBe('右 親指4（最外）');
  });

  it('gives every physical key a non-empty, unique name', () => {
    const seen = new Set<string>();
    for (const k of KOBU2_BOARD.keys) {
      const label = positionLabel(k.row, k.col);
      expect(label.length).toBeGreaterThan(0);
      expect(seen.has(label), `duplicate label ${label}`).toBe(false);
      seen.add(label);
    }
    expect(seen.size).toBe(KOBU2_BOARD.keys.length);
  });
});
