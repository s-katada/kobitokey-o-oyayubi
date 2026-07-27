/**
 * Keycode picker.
 *
 * Two ways in: browse by category (or search), or flip on 「キー入力で設定」
 * and physically press the key you want. The 動作 row on the bottom turns a
 * plain keycode into a tap-hold / with-modifier / layer-tap encoding, so the
 * compound keycodes kobu actually uses are reachable without typing hex.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { hidCodeForEventCode } from '../lib/keyEventMap';
import type { KeyboardLayoutDef } from '../protocol/handshake';
import {
  BASE_CATALOGUE,
  type Category,
  encodeDF,
  encodeLT,
  encodeMO,
  encodeMT,
  encodeOSL,
  encodeTG,
  encodeTO,
  encodeWM,
  KC_NO,
  KC_TRANSPARENT,
  type KeycodeMeta,
  labelForKeycode,
  MACRO_CATALOGUE,
  MOD_ALT,
  MOD_CTRL,
  MOD_GUI,
  MOD_SHIFT,
  searchCatalogue,
  userCatalogue,
} from '../protocol/keycodes';
import { layerIndices, layerName } from './LayerBar';
import { Button, Chip } from './ui';

type Tab = Category | 'layer';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'basic', label: '基本' },
  { id: 'modifier', label: '修飾' },
  { id: 'special', label: '特殊' },
  { id: 'function', label: 'F キー' },
  { id: 'layer', label: 'レイヤー' },
  { id: 'mouse', label: 'マウス' },
  { id: 'media', label: 'メディア' },
  { id: 'system', label: 'システム' },
  { id: 'user', label: 'kobu 機能' },
  { id: 'macro', label: 'マクロ' },
  { id: 'other', label: 'その他' },
];

type Behaviour = 'plain' | 'with-mod' | 'hold-mod' | 'hold-layer';

const BEHAVIOURS: ReadonlyArray<{ id: Behaviour; label: string; hint: string }> = [
  { id: 'plain', label: 'そのまま', hint: '押したキーコードをそのまま送ります' },
  { id: 'with-mod', label: '修飾つき', hint: '選んだ修飾キーを押しながら入力します' },
  { id: 'hold-mod', label: '長押しで修飾', hint: '単押し = キー / 長押し = 修飾キー' },
  { id: 'hold-layer', label: '長押しでレイヤー', hint: '単押し = キー / 長押し = レイヤー切替' },
];

const MODS: ReadonlyArray<{ bit: number; label: string }> = [
  { bit: MOD_CTRL, label: 'Ctrl' },
  { bit: MOD_SHIFT, label: 'Shift' },
  { bit: MOD_ALT, label: 'Alt' },
  { bit: MOD_GUI, label: 'Cmd' },
];

const LAYER_ACTIONS: ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
  encode: (layer: number) => number;
}> = [
  { id: 'MO', label: '長押し中', hint: 'MO — 押している間だけ有効', encode: encodeMO },
  { id: 'TG', label: '切替', hint: 'TG — 押すたびに ON / OFF', encode: encodeTG },
  { id: 'TO', label: '移動', hint: 'TO — このレイヤーだけを有効化', encode: encodeTO },
  { id: 'OSL', label: '次の 1 打', hint: 'OSL — 次に押すキーだけ有効', encode: encodeOSL },
  { id: 'DF', label: '既定に設定', hint: 'DF — 起動時のレイヤーを変更', encode: encodeDF },
];

const QUICK: ReadonlyArray<{ code: number; label: string; title: string }> = [
  { code: KC_TRANSPARENT, label: '▽ 透過', title: '下のレイヤーの割り当てをそのまま使う' },
  { code: KC_NO, label: '✕ なし', title: '何もしないキーにする' },
];

export interface KeyPickerProps {
  /** Human position label, e.g. "左 上段 小指". */
  positionLabel: string;
  currentCode: number | undefined;
  layerCount: number;
  definition?: KeyboardLayoutDef | undefined;
  isDirty: boolean;
  onAssign: (code: number) => void;
  onRevert: () => void;
}

export function KeyPicker({
  positionLabel,
  currentCode,
  layerCount,
  definition,
  isDirty,
  onAssign,
  onRevert,
}: KeyPickerProps) {
  const searchId = useId();
  const [tab, setTab] = useState<Tab>('basic');
  const [query, setQuery] = useState('');
  const [behaviour, setBehaviour] = useState<Behaviour>('plain');
  const [mods, setMods] = useState(0);
  const [holdLayer, setHoldLayer] = useState(1);
  const [capturing, setCapturing] = useState(false);

  const catalogue = useMemo<readonly KeycodeMeta[]>(
    () => [...BASE_CATALOGUE, ...MACRO_CATALOGUE, ...userCatalogue(definition)],
    [definition],
  );

  /** Apply the 動作 row to a freshly-picked base keycode. */
  const decorate = (code: number): number => {
    if (code === KC_NO || code === KC_TRANSPARENT) return code;
    switch (behaviour) {
      case 'with-mod':
        return mods === 0 ? code : encodeWM(code, mods);
      case 'hold-mod':
        return mods === 0 ? code : encodeMT(code, mods);
      case 'hold-layer':
        return encodeLT(holdLayer, code);
      case 'plain':
        return code;
    }
  };

  // "Press a key to assign" — capture at the window so it works no matter
  // where focus sits, and swallow the event so the browser doesn't act on it.
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const hid = hidCodeForEventCode(e.code);
      if (hid !== undefined) {
        onAssign(decorate(hid));
        setCapturing(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  });

  const results = useMemo(() => {
    if (query.trim()) return searchCatalogue(catalogue, query, 120).map((h) => h.meta);
    if (tab === 'layer') return [];
    return catalogue.filter((m) => m.category === tab);
  }, [catalogue, query, tab]);

  const current = labelForKeycode(currentCode ?? 0, definition ? { definition } : {});
  const preview = labelForKeycode(decorate(0x04), definition ? { definition } : {});

  return (
    <section className="panel flex flex-col gap-4 p-4">
      {/* ── What is selected ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          {positionLabel}
        </span>
        <span className="text-sm text-muted">現在の割り当て</span>
        <span className="text-sm font-semibold text-ink">{current.long}</span>
        {isDirty && (
          <Button variant="ghost" className="ml-auto text-xs" onClick={onRevert}>
            このキーを元に戻す
          </Button>
        )}
      </div>

      {/* ── Search + capture ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キーを検索（例: shift、矢印、F5、コピー）"
            className="w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <Button
          variant={capturing ? 'primary' : 'default'}
          onClick={() => setCapturing((v) => !v)}
          title="キーボードで実際にキーを押して割り当てます"
        >
          {capturing ? '押してください… (Escで中止)' : '⌨ キー入力で設定'}
        </Button>
        {QUICK.map((q) => (
          <Button key={q.code} title={q.title} onClick={() => onAssign(q.code)}>
            {q.label}
          </Button>
        ))}
      </div>

      {/* ── Categories ───────────────────────────────────────────────── */}
      {!query.trim() && (
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {tab === 'layer' && !query.trim() ? (
        <div className="flex flex-col gap-3">
          {LAYER_ACTIONS.map((action) => (
            <div key={action.id} className="flex flex-wrap items-center gap-2">
              <span className="w-28 shrink-0 text-xs font-medium text-muted" title={action.hint}>
                {action.label}
              </span>
              {layerIndices(layerCount).map((i) => (
                <button
                  key={i}
                  type="button"
                  title={`${action.hint} → ${layerName(i)}`}
                  onClick={() => onAssign(action.encode(i))}
                  className="rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-xs text-ink transition hover:border-accent hover:bg-accent-soft"
                >
                  {i}
                </button>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted">
            「長押しでレイヤー」は下の動作から選び、通常のキーを押してください。
          </p>
        </div>
      ) : (
        <div
          className="grid max-h-72 gap-1.5 overflow-y-auto pr-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))' }}
        >
          {results.map((meta) => {
            const active = meta.code === currentCode;
            return (
              <button
                key={`${meta.category}-${meta.code}-${meta.name}`}
                type="button"
                title={meta.description}
                onClick={() => onAssign(decorate(meta.code))}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 transition ${
                  active
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-panel-2 hover:border-accent hover:bg-accent-soft'
                }`}
              >
                <span className="truncate text-sm font-semibold text-ink">{meta.shortLabel}</span>
                <span className="w-full truncate px-1 text-center text-[10px] leading-tight text-muted">
                  {meta.label}
                </span>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted">
              該当するキーがありません
            </p>
          )}
        </div>
      )}

      {/* ── Behaviour ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">動作</span>
          {BEHAVIOURS.map((b) => (
            <Chip
              key={b.id}
              active={behaviour === b.id}
              title={b.hint}
              onClick={() => setBehaviour(b.id)}
            >
              {b.label}
            </Chip>
          ))}
        </div>

        {(behaviour === 'with-mod' || behaviour === 'hold-mod') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">修飾キー</span>
            {MODS.map((m) => (
              <Chip
                key={m.bit}
                active={(mods & m.bit) !== 0}
                onClick={() => setMods((v) => v ^ m.bit)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
        )}

        {behaviour === 'hold-layer' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">切り替え先</span>
            {layerIndices(layerCount).map((i) => (
              <Chip key={i} active={holdLayer === i} onClick={() => setHoldLayer(i)}>
                {i} {layerName(i)}
              </Chip>
            ))}
          </div>
        )}

        {behaviour !== 'plain' && (
          <p className="text-xs text-muted">
            この状態でキーを選ぶと <span className="font-medium text-ink">{preview.long}</span>{' '}
            のような割り当てになります。
          </p>
        )}
      </div>
    </section>
  );
}
