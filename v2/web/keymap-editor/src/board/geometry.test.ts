import { describe, expect, it } from 'vitest';
import {
  KEY_COUNT,
  KOBU2_BOARD,
  keyAt,
  keysOfSide,
  MAIN_PITCH,
  type Side,
  type Vec2,
} from './geometry';

/** Ray-casting point-in-polygon. */
function inside(poly: ReadonlyArray<Vec2>, p: Vec2): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

const plateFor = (side: Side, kind: 'main' | 'thumb') =>
  KOBU2_BOARD.plates.find((p) => p.side === side && p.kind === kind);

describe('kobu2 board geometry', () => {
  it('has one key per matrix slot of the 4x10 layout', () => {
    expect(KEY_COUNT).toBe(40);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 10; col++) {
        expect(keyAt(row, col), `missing (${row},${col})`).toBeDefined();
      }
    }
  });

  it('splits 20 keys per half', () => {
    expect(keysOfSide('left')).toHaveLength(20);
    expect(keysOfSide('right')).toHaveLength(20);
    expect(KOBU2_BOARD.keys.filter((k) => k.col <= 4).every((k) => k.side === 'left')).toBe(true);
    expect(KOBU2_BOARD.keys.filter((k) => k.col >= 5).every((k) => k.side === 'right')).toBe(true);
  });

  it('puts the v2 extra key at the foot of the pinky column on both halves', () => {
    for (const [row3Col, pinkyCol] of [
      [0, 0],
      [9, 9],
    ] as const) {
      const extra = keyAt(3, row3Col);
      const above = keyAt(2, pinkyCol);
      expect(extra?.kind).toBe('main');
      expect(above).toBeDefined();
      if (!extra || !above) throw new Error('unreachable');
      // Same column, exactly one row pitch below the old bottom row.
      expect(extra.x).toBeCloseTo(above.x, 6);
      expect(extra.y - above.y).toBeCloseTo(MAIN_PITCH, 6);
    }
  });

  it('marks the eight thumb keys and nothing else as thumb keys', () => {
    const thumbs = KOBU2_BOARD.keys.filter((k) => k.kind === 'thumb');
    expect(thumbs).toHaveLength(8);
    expect(thumbs.every((k) => k.row === 3)).toBe(true);
    // Row 3 columns 1..4 and 5..8 are the thumbs; 0 and 9 are main keys.
    expect(new Set(thumbs.map((k) => k.col))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('keeps the main columns on a 16mm pitch with the CAD column stagger', () => {
    const topRow = [0, 1, 2, 3, 4].map((col) => keyAt(0, col));
    const xs = topRow.map((k) => k?.x ?? Number.NaN);
    expect(xs).toEqual([0, 16, 32, 48, 64]);
    // Middle column is the forward-most; the pinky column drops 14mm.
    const ys = topRow.map((k) => k?.y ?? Number.NaN);
    expect(ys).toEqual([14, 4, 0, 2, 4]);
  });

  it('mirrors the right half about the gap', () => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const l = keyAt(row, col);
        const r = keyAt(row, 9 - col);
        if (!l || !r) throw new Error(`missing pair at row ${row} col ${col}`);
        expect(r.y).toBeCloseTo(l.y, 6);
        expect(r.rot).toBeCloseTo(-l.rot, 6);
        expect(r.size).toBeCloseTo(l.size, 6);
      }
    }
    // …and the mirror is a single rigid reflection, so every pair shares
    // the same midpoint.
    const mids = KOBU2_BOARD.keys
      .filter((k) => k.side === 'left')
      .map((k) => {
        const partner = keyAt(k.row, 9 - k.col);
        return (k.x + (partner?.x ?? Number.NaN)) / 2;
      });
    const first = mids[0] ?? Number.NaN;
    for (const m of mids) expect(m).toBeCloseTo(first, 6);
  });

  it('never overlaps two caps', () => {
    const keys = KOBU2_BOARD.keys;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        if (!a || !b) continue;
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        // Rotated caps can approach on the diagonal, so compare against
        // the inscribed circles rather than the bounding boxes.
        expect(gap, `${a.row},${a.col} overlaps ${b.row},${b.col}`).toBeGreaterThan(
          (a.size + b.size) / 2 - 3,
        );
      }
    }
  });

  it('emits a viewBox that contains every key cap', () => {
    const { viewBox, keys } = KOBU2_BOARD;
    for (const k of keys) {
      const r = (k.size / 2) * Math.SQRT2;
      expect(k.x - r).toBeGreaterThanOrEqual(viewBox.x);
      expect(k.x + r).toBeLessThanOrEqual(viewBox.x + viewBox.width);
      expect(k.y - r).toBeGreaterThanOrEqual(viewBox.y);
      expect(k.y + r).toBeLessThanOrEqual(viewBox.y + viewBox.height);
    }
  });

  /*
   * The plate outlines come from the case DXFs, registered to the KiCad
   * switch coordinates by a translation. If that registration ever drifts
   * — a re-export, a changed offset — keys start floating outside their
   * plate. These two are the guard.
   */
  it('keeps every main key, cap corners included, on the main plate', () => {
    for (const k of KOBU2_BOARD.keys.filter((k) => k.kind === 'main')) {
      const plate = plateFor(k.side, 'main');
      expect(plate, `no main plate for ${k.side}`).toBeDefined();
      if (!plate) continue;
      const r = k.size / 2;
      const corners: Vec2[] = [
        k,
        { x: k.x - r, y: k.y - r },
        { x: k.x + r, y: k.y - r },
        { x: k.x + r, y: k.y + r },
        { x: k.x - r, y: k.y + r },
      ];
      for (const c of corners) {
        expect(inside(plate.points, c), `(${k.row},${k.col}) hangs off the main plate`).toBe(true);
      }
    }
  });

  it('keeps every thumb key on the thumb plate', () => {
    for (const k of KOBU2_BOARD.keys.filter((k) => k.kind === 'thumb')) {
      const plate = plateFor(k.side, 'thumb');
      if (!plate) throw new Error('missing thumb plate');
      expect(inside(plate.points, k), `(${k.row},${k.col}) is off the thumb plate`).toBe(true);
    }
  });

  /**
   * The thumb plate's rear edge is where the outer key's 15mm opening was
   * cut, so it runs exactly half an opening above that key's centre. That
   * ties DXF geometry to a KiCad switch coordinate, which is the check
   * that a bad re-export or a changed offset has to survive.
   */
  it('runs the thumb plate’s rear edge half an opening above the outer key', () => {
    for (const [side, col] of [
      ['left', 1],
      ['right', 8],
    ] as const) {
      const plate = plateFor(side, 'thumb');
      const key = keyAt(3, col);
      if (!plate || !key) throw new Error('missing thumb plate or key');
      // Rear edge = the rear-most horizontal run spanning that key's x.
      let rear = Infinity;
      for (let i = 0; i < plate.points.length; i++) {
        const a = plate.points[i];
        const b = plate.points[(i + 1) % plate.points.length];
        if (!a || !b || Math.abs(a.y - b.y) > 1e-6) continue;
        if (key.x < Math.min(a.x, b.x) || key.x > Math.max(a.x, b.x)) continue;
        rear = Math.min(rear, a.y);
      }
      expect(rear).toBeLessThan(Infinity);
      expect(key.y - rear).toBeCloseTo(7.5, 2);
    }
  });

  it('places both trackballs outboard of the innermost thumb key', () => {
    const [left, right] = KOBU2_BOARD.balls;
    const innerLeft = keyAt(3, 4);
    const innerRight = keyAt(3, 5);
    if (!left || !right || !innerLeft || !innerRight) throw new Error('unreachable');
    expect(left.x).toBeGreaterThan(innerLeft.x);
    expect(right.x).toBeLessThan(innerRight.x);
    expect(left.ball).toBeLessThan(left.bezel);
  });
});
