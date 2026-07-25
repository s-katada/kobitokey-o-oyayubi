/**
 * Physical geometry of the kobu2 (v2) keyboard, in millimetres.
 *
 * Coordinate frame: looking straight down at the assembled keyboard.
 * `+x` runs to the right, `+y` runs toward the user (i.e. down on screen,
 * matching SVG). Rotations are degrees **clockwise**, also matching SVG's
 * `rotate()`.
 *
 * ## Everything here is measured, not drawn by eye
 *
 * Switch positions come from the as-built KiCad boards, and the case
 * outlines come from the DXFs the printed plates were actually cut from:
 *
 *   * `v2/pcb/left-main/left-main.kicad_pcb`   — 16 main switches
 *   * `v2/pcb/thumb-left/thumb-left.kicad_pcb` — 4 thumb switches, PMW3610
 *   * `v2/pcb/main-top.dxf`                    — main top-plate outline
 *   * `v2/pcb/thumb-top.dxf`                   — thumb top-plate outline
 *   * `v2/case/*.stl`                          — trackball housing, XIAO lid, hinge
 *
 * ⚠ The v2 boards carry their switch footprints on **B.Cu**, so KiCad's
 * default (front) view is mirrored with respect to the physical top view.
 * Every x is therefore negated before use:
 *
 *   main:  x = 182 - x_kicad,  y = y_kicad - 72.088
 *   thumb: x = 220 - x_kicad,  y = y_kicad - 44
 *
 * The DXFs land in that same frame under a pure translation, which is how
 * they were registered: each DXF carries one Ø5.5 hole per switch, and
 * those holes match the KiCad switch centres to 0.001mm once translated by
 * `MAIN_DXF_OFFSET` / `THUMB_DXF_OFFSET`. The STL parts agree too — the
 * trackball housing's centre lands 0.3mm from the PMW3610 footprint.
 *
 * The single fitted number is the main↔thumb offset baked into the thumb
 * transform above: they are separate KiCad projects with unrelated
 * origins, so their relative placement was matched against the reference
 * photo (`docs/kobu2-reference.jpg`) across all four thumb keys and the
 * ball. Residual is ~2mm.
 *
 * ## Matrix mapping
 *
 * The left half's `col_pins` are listed in reverse net order, so keymap
 * column 0 is the OUTER pinky (`/COL4`) and column 4 the inner index
 * (`/COL0`). The right half is natural with `col_offset = 5`, which makes
 * it an exact mirror: right column `c` sits where left column `9 - c` does.
 *
 * Row 3 is the thumb row, and it is where v2 differs from v1: the
 * previously unused `/ROW3 x /COL4` intersection now carries a real
 * switch on each MAIN board — the 4th key at the foot of the pinky
 * column — landing on keymap (3,0) and (3,9).
 */

export type Side = 'left' | 'right';
export type KeyKind = 'main' | 'thumb';

export interface BoardKey {
  /** Matrix row, 0..3. */
  row: number;
  /** Unified keymap column, 0..9 (0..4 left, 5..9 right). */
  col: number;
  side: Side;
  /** Cap centre, mm. */
  x: number;
  y: number;
  /** Cap rotation, degrees clockwise. */
  rot: number;
  /** Cap edge length, mm (thumb caps are larger than main caps). */
  size: number;
  kind: KeyKind;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A case plate, drawn as a filled polygon with a raised rim.
 *
 * The thumb unit's four 15mm switch openings are already part of
 * `points` — the DXF traces them as notches in the outline rather than as
 * separate holes, because each one is flush with the plate's rear edge.
 * They are not carried separately: a 17.6mm thumb cap overhangs a 15mm
 * opening on every side, so there would be nothing left to see.
 */
export interface Plate {
  side: Side;
  kind: 'main' | 'thumb';
  points: Vec2[];
}

export interface Trackball {
  side: Side;
  x: number;
  y: number;
  /** Outer housing radius. */
  bezel: number;
  /** Visible ball radius. */
  ball: number;
}

/** The printed lid over the XIAO / battery / sensor bay. */
export interface CoverPlate {
  side: Side;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The round boss joining the main plate to the thumb plate. */
export interface Hinge {
  side: Side;
  x: number;
  y: number;
  r: number;
}

export interface BoardGeometry {
  keys: BoardKey[];
  plates: Plate[];
  balls: Trackball[];
  covers: CoverPlate[];
  hinges: Hinge[];
  viewBox: { x: number; y: number; width: number; height: number };
}

// ── Constants ─────────────────────────────────────────────────────────

/** Main-unit switch pitch, both axes (v2 PCB: 16.0mm). */
export const MAIN_PITCH = 16;
/**
 * Keycap edge lengths, measured off the reference photo against the known
 * switch pitch. The main unit wears Choc caps on a 16mm pitch; the thumb
 * cluster wears larger caps on an 18.65mm arc pitch.
 */
export const MAIN_CAP = 14.6;
export const THUMB_CAP = 17.6;
/** Side plate stands 1.65mm proud of the top plate all the way round. */
export const PLATE_RIM = 1.65;
/** Gap drawn between the two halves in the unified view. */
const HALF_GAP = 26;
/** Padding around the whole board in the emitted viewBox. */
const VIEW_PAD = 5;

/**
 * Left-half main columns, indexed by **keymap column** (0 = outer pinky).
 * `x` and `topY` are the transcribed CAD values; `rows` is 4 only for the
 * pinky column, which is what v2 added.
 */
const MAIN_COLUMNS: ReadonlyArray<{ x: number; topY: number; rows: number }> = [
  { x: 0, topY: 14, rows: 4 }, // /COL4 — outer pinky (Q/A/Z + the new key)
  { x: 16, topY: 4, rows: 3 }, // /COL3 — ring
  { x: 32, topY: 0, rows: 3 }, // /COL2 — middle (the forward-most column)
  { x: 48, topY: 2, rows: 3 }, // /COL1 — index
  { x: 64, topY: 4, rows: 3 }, // /COL0 — inner index
];

/**
 * Left-half thumb keys, already transformed into the shared frame.
 * Listed inner → outer, i.e. by descending keymap column: (3,4) is the
 * key directly under the XIAO, (3,1) the outer edge.
 */
const THUMB_KEYS: ReadonlyArray<{ col: number; x: number; y: number; rot: number }> = [
  { col: 4, x: 93.845, y: 80.261, rot: 28.6 }, // /COL0 — XIAO直下 (innermost)
  { col: 3, x: 77.131, y: 72.7, rot: 20 }, // /COL1
  { col: 2, x: 59.088, y: 67.72, rot: 10 }, // /COL2
  { col: 1, x: 40.494, y: 66.223, rot: 0 }, // /COL3 — outer edge
];

/**
 * Main plate silhouette, from `v2/pcb/main-top.dxf` translated by
 * (+73.5, +46.5).
 *
 * The DXF's small semicircular bites — screw-boss reliefs in the TOP plate
 * — have been filled: the side plate walls straight past them, so they are
 * not part of what you see looking down at an assembled unit, and leaving
 * them in made the render read as a bare plate rather than a keyboard.
 * Only concave detours are filled, and only ones traced as flattened
 * arcs (4+ segments, under 9mm across, under 18mm of area). The real
 * staircase steps are 2-3 straight segments, so shape — not size — is
 * what tells them apart, and the column stagger survives untouched.
 *
 * Removed separately, by name: the 13.5 x 7mm notch at x=27..42 that
 * `v2/case/hinji-cover.stl` seats into. A size rule cannot catch it — a
 * column step encloses ~30mm and that notch ~90mm — so it is matched
 * exactly, and a DXF that moves it fails the export rather than quietly
 * leaving a bite in the edge.
 */
const MAIN_PLATE_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [69.9, 46.5],
  [74.5, 45.26],
  [74.5, -5.09],
  [73.09, -6.5],
  [61.61, -6.5],
  [56.83, -8.5],
  [41.5, -8.5],
  [41.5, -9.09],
  [40.09, -10.5],
  [22.91, -10.5],
  [21.5, -9.09],
  [21.5, -6.5],
  [7.18, -6.5],
  [3.5, -2.82],
  [3.5, 2.5],
  [-9.09, 2.5],
  [-10.5, 3.91],
  [-10.5, 71.09],
  [-9.09, 72.5],
  [7.89, 72.5],
  [11.5, 68.89],
  [11.5, 46.5],
];

/**
 * Thumb plate silhouette, from `v2/pcb/thumb-top.dxf` translated by
 * (+79.164, +37.575), with the same small-notch fill applied.
 *
 * This is the shape the first build got badly wrong: it is not a uniform
 * band around the keys. The rear edge is straight, the front edge sweeps
 * out in a long arc that widens toward the ball, the outer end is a
 * near-straight cut, and the whole thing turns north at x=83.29 into the
 * neck that carries the XIAO and battery.
 *
 * The outer key's 15mm opening is cut flush with that rear edge, so the
 * DXF traces it as a square notch. It is removed here for the same reason
 * as the hinge seat: the 17.6mm cap overhangs it on every side, so on an
 * assembled unit there is nothing to see but a straight edge.
 */
const THUMB_PLATE_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [47.29, 58.72],
  [47.29, 53.57],
  [50.65, 53.78],
  [57.35, 54.5],
  [60.68, 55.02],
  [67.28, 56.38],
  [73.78, 58.15],
  [76.99, 59.19],
  [83.29, 61.57],
  [83.29, 13.35],
  [108.09, 13.35],
  [108.09, 76.07],
  [98.03, 94.51],
  [91.03, 89.98],
  [84.01, 86.12],
  [76.94, 82.93],
  [69.82, 80.37],
  [62.61, 78.4],
  [55.24, 77.0],
  [47.63, 76.18],
  [39.72, 75.96],
  [30.3, 76.45],
  [29.42, 70.56],
  [28.2, 58.72],
];

/**
 * Trackball housing. Centre is `v2/case/trabo-case.stl`'s footprint centre
 * mapped into this frame — 0.3mm off the PMW3610 footprint, which is the
 * cross-check that the STL and KiCad frames agree. The housing measures
 * 29.3 x 32.0mm, so it is very slightly oval; a 15.3mm radius splits it.
 */
const BALL_CENTRE: Vec2 = { x: 95.28, y: 54.77 };
/**
 * Housing outer radius. The STL footprint is 29.3 x 32.0mm — slightly oval
 * because the cradle's base flares on one axis — and this takes the narrow
 * one, which is the ring you actually read as the housing from above.
 */
const BALL_BEZEL_R = 14.65;
/**
 * Visible aperture, NOT the ball diameter. The printed cradle is a "C"
 * whose lip overlaps the 25mm ball, so from above only about two thirds of
 * the housing's width shows as white.
 */
const BALL_R = 9.5;

/** `v2/case/xiao-cover.stl`, mapped in. Runs under the ball housing. */
const COVER: CoverPlate = { side: 'left', x: 95.28, y: 44.18, width: 29.5, height: 64.65 };

/**
 * The post joining the main plate to the thumb plate, sitting in the main
 * plate's bottom notch. `v2/case/hinji-cover.stl` is a 12 x 3.5mm cover;
 * what reads from above is the round boss under it, measured off the photo
 * at ~8mm across.
 */
const HINGE_R = 4;
const HINGE_CENTRE: Vec2 = { x: 34.5, y: 49.4 };

// ── Builders ──────────────────────────────────────────────────────────

const toVec = (p: readonly [number, number]): Vec2 => ({ x: p[0], y: p[1] });

function leftMainKeys(): BoardKey[] {
  const out: BoardKey[] = [];
  MAIN_COLUMNS.forEach((column, col) => {
    for (let row = 0; row < column.rows; row++) {
      out.push({
        row,
        col,
        side: 'left',
        x: column.x,
        y: column.topY + row * MAIN_PITCH,
        rot: 0,
        size: MAIN_CAP,
        kind: 'main',
      });
    }
  });
  return out;
}

function leftThumbKeys(): BoardKey[] {
  return THUMB_KEYS.map((k) => ({
    row: 3,
    col: k.col,
    side: 'left' as const,
    x: k.x,
    y: k.y,
    rot: k.rot,
    size: THUMB_CAP,
    kind: 'thumb' as const,
  }));
}

// ── Mirroring ─────────────────────────────────────────────────────────

const mirrorPoint = (axis: number, p: Vec2): Vec2 => ({ x: axis - p.x, y: p.y });

function mirrorKey(axis: number, k: BoardKey): BoardKey {
  return {
    ...k,
    side: 'right',
    // Right column c occupies the position of left column 9 - c, so the
    // inverse mapping for a left key is simply 9 - col.
    col: 9 - k.col,
    x: axis - k.x,
    y: k.y,
    rot: -k.rot,
  };
}

// ── Assembly ──────────────────────────────────────────────────────────

function build(): BoardGeometry {
  const leftKeys = [...leftMainKeys(), ...leftThumbKeys()];
  const mainPoints = MAIN_PLATE_OUTLINE.map(toVec);
  const thumbPoints = THUMB_PLATE_OUTLINE.map(toVec);

  // Left-half extent. The plates plus their rim bound everything else,
  // except the ball housing, which pokes past the thumb plate's edge.
  const xs = [
    ...mainPoints.map((p) => p.x),
    ...thumbPoints.map((p) => p.x),
    BALL_CENTRE.x - BALL_BEZEL_R,
    BALL_CENTRE.x + BALL_BEZEL_R,
    COVER.x - COVER.width / 2,
    COVER.x + COVER.width / 2,
  ];
  const ys = [
    ...mainPoints.map((p) => p.y),
    ...thumbPoints.map((p) => p.y),
    BALL_CENTRE.y - BALL_BEZEL_R,
    BALL_CENTRE.y + BALL_BEZEL_R,
    COVER.y - COVER.height / 2,
    COVER.y + COVER.height / 2,
    HINGE_CENTRE.y + HINGE_R,
  ];
  const minX = Math.min(...xs) - PLATE_RIM;
  const maxX = Math.max(...xs) + PLATE_RIM;
  const minY = Math.min(...ys) - PLATE_RIM;
  const maxY = Math.max(...ys) + PLATE_RIM;

  // Mirror axis chosen so the right half starts HALF_GAP past the left one.
  const axis = 2 * maxX + HALF_GAP;

  const keys = [...leftKeys, ...leftKeys.map((k) => mirrorKey(axis, k))];
  const plates: Plate[] = [
    { side: 'left', kind: 'main', points: mainPoints },
    { side: 'left', kind: 'thumb', points: thumbPoints },
    { side: 'right', kind: 'main', points: mainPoints.map((p) => mirrorPoint(axis, p)) },
    { side: 'right', kind: 'thumb', points: thumbPoints.map((p) => mirrorPoint(axis, p)) },
  ];
  const balls: Trackball[] = [
    { side: 'left', ...BALL_CENTRE, bezel: BALL_BEZEL_R, ball: BALL_R },
    { side: 'right', ...mirrorPoint(axis, BALL_CENTRE), bezel: BALL_BEZEL_R, ball: BALL_R },
  ];
  const covers: CoverPlate[] = [COVER, { ...COVER, side: 'right', x: axis - COVER.x }];
  const leftHinge: Hinge = { side: 'left', ...HINGE_CENTRE, r: HINGE_R };
  const hinges: Hinge[] = [leftHinge, { ...leftHinge, side: 'right', x: axis - leftHinge.x }];

  return {
    keys,
    plates,
    balls,
    covers,
    hinges,
    viewBox: {
      x: minX - VIEW_PAD,
      // The right half is the mirror of the left, so the far edge sits at
      // `axis - minX` and the total width follows from that.
      y: minY - VIEW_PAD,
      width: axis - minX - minX + VIEW_PAD * 2,
      height: maxY - minY + VIEW_PAD * 2,
    },
  };
}

/** The kobu2 board. Pure data — identical on every call. */
export const KOBU2_BOARD: BoardGeometry = build();

/** Total physical keys: 4x10 — v2 fills every slot. */
export const KEY_COUNT = KOBU2_BOARD.keys.length;

const KEY_INDEX = new Map<string, BoardKey>(KOBU2_BOARD.keys.map((k) => [`${k.row},${k.col}`, k]));

/** Look up the physical key at a matrix position, if one exists. */
export function keyAt(row: number, col: number): BoardKey | undefined {
  return KEY_INDEX.get(`${row},${col}`);
}

/** Every key of one half, in reading order (row, then column). */
export function keysOfSide(side: Side): BoardKey[] {
  return KOBU2_BOARD.keys
    .filter((k) => k.side === side)
    .sort((a, b) => a.row - b.row || a.col - b.col);
}
