/**
 * Physical geometry of the kobu2 (v2) keyboard, in millimetres.
 *
 * Coordinate frame: looking straight down at the assembled keyboard.
 * `+x` runs to the right, `+y` runs toward the user (i.e. down on screen,
 * matching SVG). Rotations are degrees **clockwise**, also matching SVG's
 * `rotate()`.
 *
 * ## Where the numbers come from
 *
 * Everything inside one unit is transcribed from the as-built KiCad
 * boards, so key spacing and the thumb arc are exact rather than eyeballed:
 *
 *   * `v2/pcb/left-main/left-main.kicad_pcb`   — 16 main switches
 *   * `v2/pcb/thumb-left/thumb-left.kicad_pcb` — 4 thumb switches, PMW3610, XIAO
 *
 * ⚠ Those boards carry their switch footprints on **B.Cu**, so KiCad's
 * default (front) view is mirrored with respect to the physical top view.
 * Every x below is therefore negated before use:
 *
 *   main:  x = 182 - x_kicad,  y = y_kicad - 72.088
 *   thumb: x = 220 - x_kicad,  y = y_kicad - 44
 *
 * The main transform just moves the outer pinky column to x = 0 and the
 * top row to y = 0. The thumb transform's constants are the one thing CAD
 * cannot supply — main and thumb are separate KiCad projects with
 * unrelated origins — so the offset was fitted to the reference photo
 * (`docs/kobu2-reference.jpg`) across all four thumb keys and the
 * trackball; the residual is ~2mm.
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

export interface PlateOutline {
  side: Side;
  points: Vec2[];
}

export interface ThumbBand {
  side: Side;
  /** Centre line of the band; drawn as a thick round-capped polyline. */
  points: Vec2[];
  width: number;
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

export interface CoverPlate {
  side: Side;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HingePost {
  side: Side;
  x: number;
  y: number;
  r: number;
}

export interface BoardGeometry {
  keys: BoardKey[];
  plates: PlateOutline[];
  thumbBands: ThumbBand[];
  balls: Trackball[];
  covers: CoverPlate[];
  posts: HingePost[];
  viewBox: { x: number; y: number; width: number; height: number };
}

// ── Constants ─────────────────────────────────────────────────────────

/** Main-unit switch pitch, both axes (v2 PCB: 16.0mm). */
export const MAIN_PITCH = 16;
/** Main keycap edge length. Choc caps on a 16mm pitch leave ~1mm of gap. */
export const MAIN_CAP = 15;
/** Thumb keycap edge length — the thumb arc uses an ~18.6mm pitch. */
export const THUMB_CAP = 17.5;
/** Plate material visible around the outermost caps. */
const PLATE_PAD = 3.5;
/** Gap drawn between the two halves in the unified view. */
const HALF_GAP = 30;
/** Padding around the whole board in the emitted viewBox. */
const VIEW_PAD = 6;

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

/** PMW3610 centre = ball centre (thumb board U2). */
const BALL_CENTRE: Vec2 = { x: 95.544, y: 54.824 };
const BALL_BEZEL_R = 18;
const BALL_R = 13;

/**
 * The flat lid over the XIAO / battery bay. Purely decorative, and the
 * only element sized from the photo rather than CAD — the printed lid is
 * considerably larger than the U1 footprint underneath it.
 */
const COVER: CoverPlate = { side: 'left', x: 95.7, y: 24, width: 34, height: 31 };

/** The little post joining the main plate to the thumb plate. */
const POST: HingePost = { side: 'left', x: 36.5, y: 50, r: 4 };

// ── Builders ──────────────────────────────────────────────────────────

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

/**
 * Staircase outline of the main plate: the top and bottom edges step at
 * every column boundary, which is exactly how the printed case looks.
 */
function leftMainPlate(): Vec2[] {
  const half = MAIN_PITCH / 2;
  const first = MAIN_COLUMNS[0];
  const last = MAIN_COLUMNS[MAIN_COLUMNS.length - 1];
  if (!first || !last) return [];

  const topOf = (c: (typeof MAIN_COLUMNS)[number]) => c.topY - MAIN_CAP / 2 - PLATE_PAD;
  const botOf = (c: (typeof MAIN_COLUMNS)[number]) =>
    c.topY + (c.rows - 1) * MAIN_PITCH + MAIN_CAP / 2 + PLATE_PAD;

  const leftEdge = first.x - half - PLATE_PAD;
  const rightEdge = last.x + half + PLATE_PAD;
  // Column boundaries, with the outer two pushed out by the plate margin.
  const bounds = MAIN_COLUMNS.map((c) => c.x + half);
  bounds[bounds.length - 1] = rightEdge;

  const pts: Vec2[] = [{ x: leftEdge, y: topOf(first) }];
  MAIN_COLUMNS.forEach((c, i) => {
    const edge = bounds[i] ?? rightEdge;
    pts.push({ x: edge, y: topOf(c) });
    const next = MAIN_COLUMNS[i + 1];
    if (next) pts.push({ x: edge, y: topOf(next) });
  });
  // Down the right edge, then back along the stepped bottom.
  pts.push({ x: rightEdge, y: botOf(last) });
  for (let i = MAIN_COLUMNS.length - 1; i >= 0; i--) {
    const c = MAIN_COLUMNS[i];
    if (!c) continue;
    const edge = i === 0 ? leftEdge : (bounds[i - 1] ?? leftEdge);
    pts.push({ x: edge, y: botOf(c) });
    const prev = MAIN_COLUMNS[i - 1];
    if (prev) pts.push({ x: edge, y: botOf(prev) });
  }
  return pts;
}

/**
 * Centre line of the thumb band. The ends are extended past the outer
 * keys so the round caps fully cover them rather than clipping a corner.
 */
function leftThumbBand(): ThumbBand {
  const pts = [...THUMB_KEYS].sort((a, b) => a.x - b.x).map((k) => ({ x: k.x, y: k.y }));
  const extend = (from: Vec2, to: Vec2, by: number): Vec2 => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: to.x + (dx / len) * by, y: to.y + (dy / len) * by };
  };
  const first = pts[0];
  const second = pts[1];
  const lastPt = pts[pts.length - 1];
  const penultimate = pts[pts.length - 2];
  const line: Vec2[] = [];
  if (first && second) line.push(extend(second, first, THUMB_CAP / 2));
  line.push(...pts);
  if (lastPt && penultimate) line.push(extend(penultimate, lastPt, THUMB_CAP / 2));
  return { side: 'left', points: line, width: THUMB_CAP + PLATE_PAD * 2 };
}

// ── Mirroring ─────────────────────────────────────────────────────────

interface Mirror {
  /** x' = axis - x */
  axis: number;
}

const mirrorPoint = (m: Mirror, p: Vec2): Vec2 => ({ x: m.axis - p.x, y: p.y });

function mirrorKey(m: Mirror, k: BoardKey): BoardKey {
  return {
    ...k,
    side: 'right',
    // Right column c occupies the position of left column 9 - c, so the
    // inverse mapping for a left key is simply 9 - col.
    col: 9 - k.col,
    x: m.axis - k.x,
    y: k.y,
    rot: -k.rot,
  };
}

// ── Assembly ──────────────────────────────────────────────────────────

function build(): BoardGeometry {
  const leftKeys = [...leftMainKeys(), ...leftThumbKeys()];
  const leftPlate = leftMainPlate();
  const leftBand = leftThumbBand();

  // Left-half extent, including plate margins and the ball housing.
  const xs = [
    ...leftPlate.map((p) => p.x),
    ...leftBand.points.map((p) => p.x - leftBand.width / 2),
    ...leftBand.points.map((p) => p.x + leftBand.width / 2),
    BALL_CENTRE.x - BALL_BEZEL_R,
    BALL_CENTRE.x + BALL_BEZEL_R,
    COVER.x - COVER.width / 2,
    COVER.x + COVER.width / 2,
  ];
  const ys = [
    ...leftPlate.map((p) => p.y),
    ...leftBand.points.map((p) => p.y - leftBand.width / 2),
    ...leftBand.points.map((p) => p.y + leftBand.width / 2),
    BALL_CENTRE.y - BALL_BEZEL_R,
    BALL_CENTRE.y + BALL_BEZEL_R,
    COVER.y - COVER.height / 2,
    COVER.y + COVER.height / 2,
  ];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Mirror axis chosen so the right half starts HALF_GAP past the left one.
  const mirror: Mirror = { axis: 2 * maxX + HALF_GAP };

  const keys = [...leftKeys, ...leftKeys.map((k) => mirrorKey(mirror, k))];
  const plates: PlateOutline[] = [
    { side: 'left', points: leftPlate },
    { side: 'right', points: leftPlate.map((p) => mirrorPoint(mirror, p)) },
  ];
  const thumbBands: ThumbBand[] = [
    leftBand,
    {
      side: 'right',
      points: leftBand.points.map((p) => mirrorPoint(mirror, p)),
      width: leftBand.width,
    },
  ];
  const balls: Trackball[] = [
    { side: 'left', ...BALL_CENTRE, bezel: BALL_BEZEL_R, ball: BALL_R },
    {
      side: 'right',
      ...mirrorPoint(mirror, BALL_CENTRE),
      bezel: BALL_BEZEL_R,
      ball: BALL_R,
    },
  ];
  const covers: CoverPlate[] = [COVER, { ...COVER, side: 'right', x: mirror.axis - COVER.x }];
  const posts: HingePost[] = [POST, { ...POST, side: 'right', x: mirror.axis - POST.x }];

  // The right half's far edge is the mirror of the left half's near edge.
  const width = mirror.axis - minX - minX;
  return {
    keys,
    plates,
    thumbBands,
    balls,
    covers,
    posts,
    viewBox: {
      x: minX - VIEW_PAD,
      y: minY - VIEW_PAD,
      width: width + VIEW_PAD * 2,
      height: maxY - minY + VIEW_PAD * 2,
    },
  };
}

/** The kobu2 board. Pure data — identical on every call. */
export const KOBU2_BOARD: BoardGeometry = build();

/** Total physical keys: 4x10 minus nothing — v2 fills every slot. */
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
