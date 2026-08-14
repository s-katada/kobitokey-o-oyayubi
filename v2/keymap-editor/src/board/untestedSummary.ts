/**
 * Turning "these keys never answered" into the sentence a person soldering
 * the board actually needs.
 *
 * A continuity test is only half useful if it just lists dead keys: what
 * decides where to put the multimeter is whether they share a *net*. Three
 * dead keys scattered over the board mean three switches; three dead keys
 * on one column mean one FFC line, one solder joint, or one MCU pin.
 *
 * ## Keymap column vs. board net
 *
 * The two are not the same, and the firmware's own comment is the reason
 * (`v2/firmware/rmk/keyboard.toml`, mirrored in `geometry.ts`): the left
 * half lists its `col_pins` in reverse net order so keymap column 0 is the
 * OUTER pinky (`/COL4`), while the right half is natural with
 * `col_offset = 5` (keymap column 5 = `/COL0`). So:
 *
 *   left  keymap col c (0..4)  →  /COL(4 - c)
 *   right keymap col c (5..9)  →  /COL(c - 5)
 *
 * Rows need no such fixing: `/ROW0../ROW3` are the keymap rows on both
 * halves.
 */

export interface Pos {
  row: number;
  col: number;
}

export const sideOf = (col: number): 'left' | 'right' => (col <= 4 ? 'left' : 'right');

/** The `/COLn` net a unified keymap column rides on. */
export function physicalCol(col: number): number {
  return col <= 4 ? 4 - col : col - 5;
}

/**
 * Describe how the untested positions cluster, or null when they don't.
 *
 * Only shared *whole* properties are reported — this is a pointer to the
 * next thing to probe, not a diagnosis, so it never guesses at a cause.
 */
export function summariseUntested(missing: ReadonlyArray<Pos>): string | null {
  if (missing.length < 2) return null;

  const first = missing[0];
  if (!first) return null;

  const sameCol = missing.every((p) => p.col === first.col);
  const sameRow = missing.every((p) => p.row === first.row);
  const sameSide = missing.every((p) => sideOf(p.col) === sideOf(first.col));
  const side = sideOf(first.col) === 'left' ? '左' : '右';

  const parts: string[] = [];
  if (sameCol) {
    parts.push(`${side}の列 ${first.col}（基板の /COL${physicalCol(first.col)}）`);
  } else if (sameSide) {
    parts.push(`${side}半分`);
  }
  if (sameRow) parts.push(`行 ${first.row}（/ROW${first.row}）`);

  if (parts.length === 0) return null;
  return `すべて ${parts.join(' の ')} に乗っています`;
}
