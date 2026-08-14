import { describe, expect, it } from 'vitest';
import { physicalCol, summariseUntested } from './untestedSummary';

describe('physicalCol', () => {
  it('un-reverses the left half', () => {
    // Keymap col 0 is the OUTER pinky, which is /COL4 on the left board.
    expect(physicalCol(0)).toBe(4);
    expect(physicalCol(4)).toBe(0);
  });

  it('leaves the right half in natural order', () => {
    expect(physicalCol(5)).toBe(0);
    expect(physicalCol(9)).toBe(4);
  });

  it('maps mirrored keys to the same net', () => {
    // Left col 1 and right col 8 are the same finger, and — the point of
    // this helper — the same /COL net on their respective boards.
    expect(physicalCol(1)).toBe(physicalCol(8));
  });
});

describe('summariseUntested', () => {
  it('says nothing for zero or one key', () => {
    expect(summariseUntested([])).toBeNull();
    expect(summariseUntested([{ row: 0, col: 0 }])).toBeNull();
  });

  it('names the shared column with its board net', () => {
    const summary = summariseUntested([
      { row: 0, col: 8 },
      { row: 1, col: 8 },
      { row: 2, col: 8 },
    ]);
    expect(summary).toContain('右の列 8');
    expect(summary).toContain('/COL3');
  });

  it('names the shared row', () => {
    const summary = summariseUntested([
      { row: 3, col: 1 },
      { row: 3, col: 7 },
    ]);
    expect(summary).toContain('/ROW3');
    // Spans both halves, so no side or column claim.
    expect(summary).not.toContain('列');
    expect(summary).not.toContain('半分');
  });

  it('falls back to the shared half when only the side matches', () => {
    const summary = summariseUntested([
      { row: 0, col: 5 },
      { row: 2, col: 9 },
    ]);
    expect(summary).toContain('右半分');
  });

  it('reports both when a whole column of one row-set is out', () => {
    const summary = summariseUntested([
      { row: 1, col: 2 },
      { row: 1, col: 2 },
    ]);
    expect(summary).toContain('左の列 2');
    expect(summary).toContain('行 1');
  });

  it('stays quiet when the dead keys share nothing', () => {
    expect(
      summariseUntested([
        { row: 0, col: 0 },
        { row: 2, col: 7 },
      ]),
    ).toBeNull();
  });
});
