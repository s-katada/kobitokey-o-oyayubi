/** Small shared primitives so the panels stay declarative. */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink border-transparent hover:brightness-105 active:brightness-95 disabled:bg-line disabled:text-muted',
  default:
    'bg-panel text-ink border-line hover:bg-panel-2 disabled:text-muted disabled:hover:bg-panel',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-panel-2 hover:text-ink',
  danger: 'bg-transparent text-danger border-line hover:bg-panel-2',
};

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Chip({
  active,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-panel text-muted hover:text-ink hover:bg-panel-2'
      } ${className}`}
      {...props}
    />
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink">{children}</h2>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export interface SliderProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  pending?: boolean;
  /** Marker rendered under the track, e.g. the firmware default. */
  defaultValue?: number;
  onChange: (value: number) => void;
}

export function Slider({
  id,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  pending,
  defaultValue,
  onChange,
}: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const defaultPct =
    defaultValue !== undefined && max > min ? ((defaultValue - min) / (max - min)) * 100 : null;

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums text-ink">
          {value}
          {unit ? <span className="ml-0.5 text-xs text-muted">{unit}</span> : null}
          {pending ? <span className="ml-1.5 text-xs text-accent">●</span> : null}
        </span>
      </div>
      <div className="relative mt-2">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-accent"
          style={{
            // Paint the filled portion so the control reads at a glance
            // even where the native accent-color is subtle.
            background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-line) ${pct}%)`,
            height: '4px',
            borderRadius: '999px',
            appearance: 'none',
          }}
        />
        {defaultPct !== null && (
          <span
            aria-hidden
            title={`既定値 ${defaultValue}`}
            className="pointer-events-none absolute -bottom-1.5 h-1.5 w-px bg-muted/60"
            style={{ left: `${defaultPct}%` }}
          />
        )}
      </div>
      {description ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

export function Toggle({
  id,
  label,
  description,
  checked,
  disabled,
  pending,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {pending ? <span className="ml-1.5 text-xs text-accent">●</span> : null}
        </label>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${
          checked ? 'border-accent bg-accent' : 'border-line bg-panel-2'
        }`}
      >
        <span
          className={`block h-4.5 w-4.5 rounded-full bg-panel shadow transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
          style={{ height: '18px', width: '18px' }}
        />
      </button>
    </div>
  );
}
