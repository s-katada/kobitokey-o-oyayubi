/**
 * The kobu2 board, drawn as the physical object.
 *
 * Everything is laid out in millimetres straight from `geometry.ts`, so
 * the SVG viewBox is literally the keyboard's footprint. Styling follows
 * the reference photo of the printed case: light grey plates, sculpted
 * grey caps lit from the top-left, a white trackball.
 *
 * Interaction: every cap is a button. Click to select, arrow keys to walk
 * the matrix, Enter/Space to open the picker.
 */

import { memo, useCallback, useId, useMemo, useRef } from 'react';
import type { KeyboardLayoutDef } from '../protocol/handshake';
import { labelForKeycode } from '../protocol/keycodes';
import type { Keymap } from '../protocol/keymap';
import { type BoardKey, KOBU2_BOARD, keyAt, PLATE_RIM, type Plate } from './geometry';

export interface KeyPosition {
  row: number;
  col: number;
}

export interface KeyboardProps {
  /** Layer whose legends are drawn. */
  layer: number;
  /** Full keymap, or null before the device has been read. */
  keymap: Keymap | null;
  /** vial.json from the device, used to humanise User0..User7. */
  definition?: KeyboardLayoutDef | undefined;
  selected: KeyPosition | null;
  /** Positions edited locally but not yet written to the keyboard. */
  dirty?: ReadonlySet<string> | undefined;
  onSelect: (pos: KeyPosition) => void;
  /** Fired on Enter/Space or a second click on the selected key. */
  onActivate?: ((pos: KeyPosition) => void) | undefined;
}

export const keyId = (row: number, col: number) => `${row},${col}`;

/** Font size that keeps `text` inside a cap of `size` mm. */
function fitFont(text: string, size: number, base: number): number {
  const budget = size - 2.6;
  const perChar = base * 0.56;
  const needed = text.length * perChar;
  if (needed <= budget) return base;
  return Math.max(base * 0.45, (budget / Math.max(text.length, 1)) * (1 / 0.56));
}

interface CapProps {
  k: BoardKey;
  code: number;
  definition?: KeyboardLayoutDef | undefined;
  selected: boolean;
  dirty: boolean;
  onSelect: (pos: KeyPosition) => void;
  onActivate?: ((pos: KeyPosition) => void) | undefined;
}

const Cap = memo(function Cap({
  k,
  code,
  definition,
  selected,
  dirty,
  onSelect,
  onActivate,
}: CapProps) {
  const label = useMemo(
    () => labelForKeycode(code, definition ? { definition } : {}),
    [code, definition],
  );
  const s = k.size;
  const half = s / 2;
  // Cap side walls vs. the top face. Lifting the top face makes the front
  // wall thicker than the back one, which is what sells the chunky printed
  // caps in the reference photo at any zoom level.
  const inset = 1.2;
  const topLift = 0.85;
  const scale = s / 15;

  const hasTop = label.top.length > 0;
  const hasBottom = label.bottom.length > 0;
  const centerBase = (hasTop || hasBottom ? 4.3 : 5.0) * scale;
  const centerSize = fitFont(label.center, s, centerBase);
  const centerY = hasTop && !hasBottom ? 1.5 * scale : hasBottom && !hasTop ? -0.6 * scale : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect({ row: k.row, col: k.col });
      onActivate?.({ row: k.row, col: k.col });
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG has no <button> element.
    <g
      role="button"
      tabIndex={0}
      aria-label={`${k.side === 'left' ? '左' : '右'} 行${k.row} 列${k.col}: ${label.long}`}
      aria-pressed={selected}
      data-key={keyId(k.row, k.col)}
      transform={`translate(${k.x} ${k.y}) rotate(${k.rot})`}
      onClick={() => {
        if (selected) onActivate?.({ row: k.row, col: k.col });
        else onSelect({ row: k.row, col: k.col });
      }}
      onKeyDown={handleKeyDown}
      className="cursor-pointer outline-none [&:focus-visible_.cap-ring]:opacity-100"
    >
      {/* Side walls */}
      <rect
        x={-half}
        y={-half}
        width={s}
        height={s}
        rx={2.3}
        fill="var(--color-cap-lo)"
        stroke="var(--color-cap-edge)"
        strokeWidth={0.28}
      />
      {/* Top face */}
      <rect
        x={-half + inset}
        y={-half + inset - topLift}
        width={s - inset * 2}
        height={s - inset * 2}
        rx={1.7}
        fill={selected ? 'var(--color-accent)' : 'url(#kb-cap-top)'}
      />
      {/* Hover wash — kept above the face so it tints the gradient. */}
      <rect
        className="opacity-0 transition-opacity duration-100 group-hover/board:opacity-0 hover:opacity-100"
        x={-half + inset}
        y={-half + inset - topLift}
        width={s - inset * 2}
        height={s - inset * 2}
        rx={1.7}
        fill="var(--color-accent)"
        fillOpacity={0.16}
      />

      {hasTop && (
        <text
          x={0}
          y={-half + 4.0 * scale}
          textAnchor="middle"
          fontSize={fitFont(label.top, s, 2.9 * scale)}
          className="font-sans select-none"
          fill={selected ? 'var(--color-accent-ink)' : 'var(--color-muted)'}
          fillOpacity={selected ? 0.85 : 1}
        >
          {label.top}
        </text>
      )}

      <text
        x={0}
        y={centerY + centerSize * 0.35}
        textAnchor="middle"
        fontSize={centerSize}
        className="font-sans font-semibold select-none"
        fill={selected ? 'var(--color-accent-ink)' : '#25272b'}
        fillOpacity={label.tone === 'muted' ? 0.38 : 1}
      >
        {label.center}
      </text>

      {hasBottom && (
        <text
          x={0}
          y={half - 2.0 * scale}
          textAnchor="middle"
          fontSize={fitFont(label.bottom, s, 2.9 * scale)}
          className="font-sans select-none"
          fill={selected ? 'var(--color-accent-ink)' : 'var(--color-muted)'}
        >
          {label.bottom}
        </text>
      )}

      {dirty && (
        <circle cx={half - 2.6} cy={-half + 2.6} r={1.15} fill="var(--color-accent)">
          <title>未書き込み</title>
        </circle>
      )}

      {/* Selection / focus ring, drawn outside the cap so it never hides a legend. */}
      <rect
        className="cap-ring transition-opacity duration-100"
        x={-half - 1.3}
        y={-half - 1.3}
        width={s + 2.6}
        height={s + 2.6}
        rx={3.4}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.1}
        opacity={selected ? 1 : 0}
      />
    </g>
  );
});

function polygonPoints(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * One case plate: the side plate, which stands 1.65mm proud all the way
 * round, painted as a stroke under the top plate's fill. Stroking the same
 * polygon is what gives the raised rim you see around the real case.
 */
function PlateShape({ plate, fill }: { plate: Plate; fill: string }) {
  const pts = polygonPoints(plate.points);
  return (
    <g>
      <polygon
        points={pts}
        fill="var(--color-case-lo)"
        stroke="var(--color-case-lo)"
        strokeWidth={PLATE_RIM * 2}
        strokeLinejoin="round"
      />
      <polygon points={pts} fill={fill} stroke="var(--color-case-edge)" strokeWidth={0.35} />
    </g>
  );
}

export function Keyboard({
  layer,
  keymap,
  definition,
  selected,
  dirty,
  onSelect,
  onActivate,
}: KeyboardProps) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const { viewBox, keys, plates, balls, covers, hinges } = KOBU2_BOARD;

  /**
   * Arrow keys walk the matrix. Left/right step through the unified
   * column order (which is already outer-pinky → inner → other half), and
   * up/down move within a column, skipping matrix slots that have no key.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (!selected) return;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      const [dRow, dCol] = delta;
      let { row, col } = selected;
      // Walk until we land on a real key or run off the matrix.
      for (let step = 0; step < 10; step++) {
        row += dRow;
        col += dCol;
        if (row < 0 || row > 3 || col < 0 || col > 9) return;
        if (keyAt(row, col)) {
          onSelect({ row, col });
          svgRef.current
            ?.querySelector<SVGGElement>(`[data-key="${keyId(row, col)}"]`)
            ?.focus({ preventScroll: true });
          return;
        }
      }
    },
    [selected, onSelect],
  );

  const layerCodes = keymap?.[layer];

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      className="group/board w-full h-auto select-none"
      // No explicit role: an <svg> is already a graphics-document, and the
      // interactive elements are the <g> caps inside it.
      aria-label="kobu2 キーボード"
      onKeyDown={handleKeyDown}
    >
      <defs>
        <linearGradient id="kb-cap-top" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="var(--color-cap-hi)" />
          <stop offset="100%" stopColor="var(--color-cap)" />
        </linearGradient>
        <linearGradient id={`${gradId}-plate`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="var(--color-case-hi)" />
          <stop offset="100%" stopColor="var(--color-case)" />
        </linearGradient>
        <radialGradient id={`${gradId}-ball`} cx="0.36" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="var(--color-ball)" />
          <stop offset="100%" stopColor="var(--color-ball-lo)" />
        </radialGradient>
        <filter id={`${gradId}-drop`} x="-12%" y="-12%" width="124%" height="130%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.9" floodOpacity="0.26" />
        </filter>
      </defs>

      {/* ── Case ─────────────────────────────────────────────────────── */}
      <g filter={`url(#${gradId}-drop)`}>
        {/* Hinge boss first: it tucks under the main plate's bottom notch. */}
        {hinges.map((hinge) => (
          <circle
            key={`hinge-${hinge.side}`}
            cx={hinge.x}
            cy={hinge.y}
            r={hinge.r}
            fill="var(--color-case)"
            stroke="var(--color-case-edge)"
            strokeWidth={0.35}
          />
        ))}
        {plates.map((plate) => (
          <PlateShape
            key={`plate-${plate.side}-${plate.kind}`}
            plate={plate}
            fill={`url(#${gradId}-plate)`}
          />
        ))}
        {/* XIAO / battery lid. Same material as the plates, so it reads as
            part of the case rather than a slab laid on top; its lower half
            disappears behind the trackball housing drawn next. */}
        {covers.map((cover) => (
          <rect
            key={`cover-${cover.side}`}
            x={cover.x - cover.width / 2}
            y={cover.y - cover.height / 2}
            width={cover.width}
            height={cover.height}
            rx={4}
            fill={`url(#${gradId}-plate)`}
            stroke="var(--color-case-edge)"
            strokeWidth={0.4}
          />
        ))}
        {balls.map((ball) => (
          <g key={`ball-${ball.side}`}>
            <circle
              cx={ball.x}
              cy={ball.y}
              r={ball.bezel}
              fill="var(--color-case-lo)"
              stroke="var(--color-case-edge)"
              strokeWidth={0.4}
            />
            <circle cx={ball.x} cy={ball.y} r={ball.ball} fill={`url(#${gradId}-ball)`} />
            <circle
              cx={ball.x}
              cy={ball.y}
              r={ball.ball}
              fill="none"
              stroke="#00000022"
              strokeWidth={0.3}
            />
          </g>
        ))}
      </g>

      {/* ── Keys ─────────────────────────────────────────────────────── */}
      <g>
        {keys.map((k) => (
          <Cap
            key={keyId(k.row, k.col)}
            k={k}
            code={layerCodes?.[k.row]?.[k.col] ?? 0}
            definition={definition}
            selected={selected?.row === k.row && selected?.col === k.col}
            dirty={dirty?.has(keyId(k.row, k.col)) ?? false}
            onSelect={onSelect}
            onActivate={onActivate}
          />
        ))}
      </g>
    </svg>
  );
}
