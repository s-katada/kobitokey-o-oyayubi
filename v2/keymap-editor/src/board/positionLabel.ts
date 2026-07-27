/**
 * Human names for matrix positions, so the picker can say
 * 「左 上段 小指」 instead of 「row 0, col 0」.
 *
 * Column semantics come from the firmware's unified 4x10 layout: on the
 * left half column 0 is the outer pinky and column 4 the inner index; the
 * right half mirrors it (column 9 is the outer pinky). Row 3 is the thumb
 * row, except at columns 0 / 9 where v2's extra main-board key lives.
 */

import { keyAt } from './geometry';

const ROW_NAMES = ['上段', '中段', '下段'] as const;
const FINGERS = ['小指', '薬指', '中指', '人差し指', '人差し指（内）'] as const;
const THUMB_NAMES = ['親指1（最内）', '親指2', '親指3', '親指4（最外）'] as const;

export function positionLabel(row: number, col: number): string {
  const side = col <= 4 ? '左' : '右';
  // Fold the right half onto the left so one table serves both.
  const mirrored = col <= 4 ? col : 9 - col;

  if (row < 3) {
    return `${side} ${ROW_NAMES[row] ?? `${row}段目`} ${FINGERS[mirrored] ?? ''}`.trim();
  }

  const key = keyAt(row, col);
  if (key?.kind === 'main') return `${side} 小指 最下段`;

  // Thumb columns run 1..4 outward from the inner key, which is mirrored
  // column 4. Index 0 = innermost.
  const thumbIndex = 4 - mirrored;
  return `${side} ${THUMB_NAMES[thumbIndex] ?? '親指'}`;
}
