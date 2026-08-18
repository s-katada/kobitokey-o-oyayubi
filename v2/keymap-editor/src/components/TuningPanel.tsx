/**
 * Live device tuning.
 *
 * Every control here writes straight through Via Custom Channel 0xC0 and
 * takes effect immediately — drag the cursor-speed slider and the ball
 * responds while you drag.
 *
 * One wire slot has no reader in the current firmware (the status LED is
 * layer-driven rather than activity-driven, so the purple hold does
 * nothing). It is shown disabled rather than hidden, so nobody wonders
 * where it went. scroll_invert_y regained a reader in the 効き pass —
 * the dominant-axis lock feeds the wheel the vertical roll whenever it
 * owns the burst — and scroll_step (id 0x08) tunes the counts-per-line
 * divisor live.
 */

import { useEffect, useId } from 'react';
import { KOBU_VALUES, type KobuSettingKey } from '../protocol/customValue';
import { READ_ONLY_KEYS, useTuningStore } from '../state/tuning';
import { Button, SectionTitle, Slider, Toggle } from './ui';

const BATTERY_POLL_MS = 30_000;

interface Meta {
  label: string;
  description: string;
  unit?: string;
  step?: number;
  /** Set when the current firmware has no reader for this slot. */
  inertReason?: string;
  /** Render the raw value as something friendlier. */
  format?: (v: number) => string;
}

const META: Record<KobuSettingKey, Meta> = {
  trackball_cpi: {
    label: 'カーソル速度',
    description:
      'ポインタ移動量の倍率です。1.00× が出荷時の速さで、上げるほど少ないボール回転で大きく動きます。',
    step: 50,
    format: (v) => `×${(v / 1000).toFixed(2)}`,
  },
  scroll_throttle_ms: {
    label: 'スクロール間隔',
    description:
      'スクロール 1 段ごとの最短間隔です。0 でボールの読み取り速度そのまま、値を上げるとゆっくり送られます。',
    unit: 'ms',
  },
  scroll_invert_x: {
    label: '横スクロールを反転',
    description: '左ボールの横方向の転がしと画面が動く向きを入れ替えます。',
  },
  scroll_invert_y: {
    label: '縦スクロールを反転',
    description: '左ボールの縦方向の転がしと画面が動く向きを入れ替えます。',
  },
  scroll_step: {
    label: 'スクロール 1 行に必要な回転量',
    description:
      'ホイール 1 行分と数えるボールの移動量（センサーカウント）です。下げるほど少ない回転でスクロールが効き、上げるほど落ち着きます。既定は 30。',
    format: (v) => `≈ ${(v / 23.6).toFixed(2)} mm/行`,
  },
  status_led_purple_hold_ms: {
    label: 'LED 紫の保持時間',
    description: '相手側のボール操作を紫で示す時間。',
    unit: 'ms',
    inertReason: 'このファームの LED はレイヤー表示に使われているため、現在は効果がありません。',
  },
  status_led_battery_high_threshold: {
    label: 'LED が緑になる残量',
    description: 'この残量より上でステータス LED が緑になります。',
    unit: '%',
  },
  status_led_battery_low_threshold: {
    label: 'LED が赤になる残量',
    description: 'この残量以下でステータス LED が赤になります。',
    unit: '%',
  },
  central_battery_percent: { label: '左（セントラル）', description: '' },
  peripheral_battery_percent: { label: '右（ペリフェラル）', description: '' },
};

const TRACKBALL_KEYS: KobuSettingKey[] = [
  'trackball_cpi',
  'scroll_step',
  'scroll_throttle_ms',
  'scroll_invert_x',
  'scroll_invert_y',
];
const LED_KEYS: KobuSettingKey[] = [
  'status_led_battery_high_threshold',
  'status_led_battery_low_threshold',
];
const INERT_KEYS: KobuSettingKey[] = ['status_led_purple_hold_ms'];

function BatteryBar({ label, percent }: { label: string; percent: number | undefined }) {
  const known = typeof percent === 'number';
  const pct = known ? Math.max(0, Math.min(100, percent)) : 0;
  const tone = !known ? 'bg-line' : pct <= 20 ? 'bg-danger' : pct <= 45 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-ink">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-ink">
        {known ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

function Control({ settingKey }: { settingKey: KobuSettingKey }) {
  const id = useId();
  const def = KOBU_VALUES.find((v) => v.key === settingKey);
  const value = useTuningStore((s) => s.values[settingKey]);
  const pending = useTuningStore((s) => s.pending.has(settingKey));
  const setValue = useTuningStore((s) => s.setValue);
  const meta = META[settingKey];
  if (!def) return null;

  const current = value ?? def.default;
  const disabled = Boolean(meta.inertReason);
  const description = meta.inertReason
    ? `${meta.description}${meta.description ? ' ' : ''}${meta.inertReason}`
    : meta.description;

  if (def.type === 'bool') {
    return (
      <Toggle
        id={id}
        label={meta.label}
        description={description}
        checked={current !== 0}
        disabled={disabled}
        pending={pending}
        onChange={(checked) => setValue(settingKey, checked ? 1 : 0)}
      />
    );
  }

  return (
    <div>
      <Slider
        id={id}
        label={meta.label}
        description={description}
        value={current}
        min={def.min}
        max={def.max}
        step={meta.step ?? 1}
        defaultValue={def.default}
        disabled={disabled}
        pending={pending}
        {...(meta.unit ? { unit: meta.unit } : {})}
        onChange={(v) => setValue(settingKey, v)}
      />
      {meta.format && <p className="mt-1 font-mono text-xs text-accent">{meta.format(current)}</p>}
    </div>
  );
}

export function TuningPanel() {
  const phase = useTuningStore((s) => s.phase);
  const error = useTuningStore((s) => s.error);
  const values = useTuningStore((s) => s.values);
  const refreshBattery = useTuningStore((s) => s.refreshBattery);
  const restoreDefaults = useTuningStore((s) => s.restoreDefaults);

  useEffect(() => {
    if (phase !== 'ready') return;
    const id = setInterval(() => void refreshBattery(), BATTERY_POLL_MS);
    return () => clearInterval(id);
  }, [phase, refreshBattery]);

  if (phase === 'loading' || phase === 'idle') {
    return <p className="py-10 text-center text-sm text-muted">設定を読み込んでいます…</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel flex flex-col gap-5 p-5">
        <SectionTitle hint="変更は即座に反映されます">トラックボール</SectionTitle>
        {TRACKBALL_KEYS.map((k) => (
          <Control key={k} settingKey={k} />
        ))}
      </section>

      <div className="flex flex-col gap-4">
        <section className="panel flex flex-col gap-5 p-5">
          <SectionTitle>ステータス LED</SectionTitle>
          {LED_KEYS.map((k) => (
            <Control key={k} settingKey={k} />
          ))}
        </section>

        <section className="panel flex flex-col gap-4 p-5">
          <SectionTitle
            hint={
              <button
                type="button"
                className="underline hover:text-ink"
                onClick={() => void refreshBattery()}
              >
                再読み込み
              </button>
            }
          >
            バッテリー
          </SectionTitle>
          {READ_ONLY_KEYS.size > 0 &&
            (['central_battery_percent', 'peripheral_battery_percent'] as const).map((k) => (
              <BatteryBar key={k} label={META[k].label} percent={values[k]} />
            ))}
          <p className="text-xs text-muted">30 秒ごとに自動更新します。</p>
        </section>
      </div>

      <section className="panel flex flex-col gap-4 p-5 lg:col-span-2">
        <SectionTitle>このファームでは未使用</SectionTitle>
        <p className="text-xs text-muted">
          設定としては送受信できますが、現在のファームウェアに読み取り側がないため動作は変わりません。
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {INERT_KEYS.map((k) => (
            <Control key={k} settingKey={k} />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <p className="flex-1 text-xs leading-relaxed text-muted">
          ⚠
          ここでの設定はキーボードの電源を入れ直すと既定値に戻ります（ファームウェアが保存しないため）。
          恒久的に変えたい場合は <code className="font-mono">keyboard.toml</code>{' '}
          を編集してビルドしてください。
        </p>
        <Button onClick={restoreDefaults}>既定値に戻す</Button>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-panel px-4 py-3 text-sm text-danger lg:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}
