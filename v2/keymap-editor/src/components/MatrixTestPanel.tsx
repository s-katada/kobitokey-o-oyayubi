/**
 * 通電テスト — press every key once and watch the board light up.
 *
 * What is being read is the firmware's raw switch bitmap, not what the
 * keyboard types (see `state/matrixTest.ts`), so this answers the
 * assembly question directly: does closing this switch reach the MCU?
 * Keys that never light up are wired wrong; keys that light up but type
 * the wrong thing are a keymap problem, and belong on the other tab.
 */

import { useEffect, useMemo } from 'react';
import { KOBU2_BOARD, keyAt } from '../board/geometry';
import { type CapTint, Keyboard, keyId } from '../board/Keyboard';
import { positionLabel } from '../board/positionLabel';
import { summariseUntested } from '../board/untestedSummary';
import { selectIsReady, useConnectionStore } from '../state/connection';
import { useKeymapStore } from '../state/keymap';
import { untestedKeys, useMatrixTestStore } from '../state/matrixTest';
import { Button, SectionTitle } from './ui';

/** All 40 kobu2 positions, in reading order. */
const BOARD_KEYS = KOBU2_BOARD.keys;

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${done === total ? 'bg-ok' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
        {done} / {total}
      </span>
    </div>
  );
}

/**
 * The matrix as the firmware sees it. Redundant with the board picture
 * on purpose: a fault usually falls on one row or one column, and that
 * pattern is obvious in a grid and invisible in a keyboard-shaped
 * drawing.
 */
function MatrixGrid({
  rows,
  cols,
  pressed,
  seen,
}: {
  rows: number;
  cols: number;
  pressed: ReadonlySet<string>;
  seen: ReadonlySet<string>;
}) {
  const rowIdx = Array.from({ length: rows }, (_, i) => i);
  const colIdx = Array.from({ length: cols }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 font-mono text-xs tabular-nums">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="px-1.5 py-1 font-normal" />
            {colIdx.map((c) => (
              <th
                key={c}
                scope="col"
                className={`px-1.5 py-1 font-normal ${c === 5 ? 'border-l border-line' : ''}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowIdx.map((r) => (
            <tr key={r}>
              <th scope="row" className="px-1.5 py-1 font-normal text-muted">
                {r}
              </th>
              {colIdx.map((c) => {
                const id = keyId(r, c);
                const exists = Boolean(keyAt(r, c));
                const tone = !exists
                  ? 'text-line'
                  : pressed.has(id)
                    ? 'text-accent font-bold'
                    : seen.has(id)
                      ? 'text-ok'
                      : 'text-danger';
                return (
                  <td
                    key={c}
                    title={exists ? positionLabel(r, c) : undefined}
                    className={`px-1.5 py-1 text-center ${c === 5 ? 'border-l border-line' : ''} ${tone}`}
                  >
                    {!exists ? '·' : pressed.has(id) ? '●' : seen.has(id) ? '✓' : '×'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        行 = <code className="font-mono">/ROW0..3</code>、列 = キーマップ列（左半分は
        <code className="font-mono">/COL</code> の並びが逆順）。
      </p>
    </div>
  );
}

function Legend() {
  const items: Array<{ tone: string; text: string }> = [
    { tone: 'bg-accent', text: '押されている' },
    { tone: 'bg-ok', text: '反応を確認済み' },
    { tone: 'bg-line', text: 'まだ反応なし' },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.text} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${i.tone}`} />
          {i.text}
        </span>
      ))}
    </div>
  );
}

export function MatrixTestPanel() {
  const phase = useMatrixTestStore((s) => s.phase);
  const error = useMatrixTestStore((s) => s.error);
  const pressed = useMatrixTestStore((s) => s.pressed);
  const seen = useMatrixTestStore((s) => s.seen);
  const chord = useMatrixTestStore((s) => s.chord);
  const unlockRemaining = useMatrixTestStore((s) => s.unlockRemaining);
  const chordKeysRemaining = useMatrixTestStore((s) => s.chordKeysRemaining);
  const demo = useMatrixTestStore((s) => s.demo);
  const start = useMatrixTestStore((s) => s.start);
  const stop = useMatrixTestStore((s) => s.stop);
  const startDemo = useMatrixTestStore((s) => s.startDemo);
  const demoPress = useMatrixTestStore((s) => s.demoPress);
  const clearSeen = useMatrixTestStore((s) => s.clearSeen);

  const rows = useKeymapStore((s) => s.rows);
  const cols = useKeymapStore((s) => s.cols);
  const draft = useKeymapStore((s) => s.draft);
  const isReady = useConnectionStore(selectIsReady);
  const definition = useConnectionStore((s) =>
    s.state.kind === 'ready' ? s.state.handshake.definition : undefined,
  );

  const running = phase === 'running';
  // Reading order (row, then column), not the geometry's build order, so
  // the list can be walked against the grid above it.
  const untested = useMemo(
    () => untestedKeys(BOARD_KEYS, seen).sort((a, b) => a.row - b.row || a.col - b.col),
    [seen],
  );
  const summary = useMemo(() => summariseUntested(untested), [untested]);

  const tints = useMemo(() => {
    const map = new Map<string, CapTint>();
    for (const id of seen) map.set(id, 'seen');
    for (const id of pressed) map.set(id, 'pressed');
    return map;
  }, [seen, pressed]);

  // Leaving the tab (or the app) must not leave a poll loop running.
  useEffect(() => () => useMatrixTestStore.getState().stop(), []);

  /*
   * While a real test runs, every key press also reaches the page as a
   * normal keystroke — Tab would walk the focus ring, Space would scroll,
   * and a stray combination could navigate away mid-test. Swallow them
   * all and keep Escape as the way out. Browser-level shortcuts (⌘W and
   * friends) are not cancelable; the note under the buttons says so.
   */
  useEffect(() => {
    if (!running || demo) return;
    const swallow = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stop();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', swallow, true);
    window.addEventListener('keyup', swallow, true);
    window.addEventListener('keypress', swallow, true);
    return () => {
      window.removeEventListener('keydown', swallow, true);
      window.removeEventListener('keyup', swallow, true);
      window.removeEventListener('keypress', swallow, true);
    };
  }, [running, demo, stop]);

  const chordNames =
    chord.length > 0
      ? chord.map((c) => positionLabel(c.row, c.col)).join(' と ')
      : '左右いちばん外側の小指キー';

  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-col gap-4 p-5">
        <SectionTitle hint={running ? (demo ? 'デモ（クリックで代用）' : '読み取り中') : undefined}>
          通電テスト
        </SectionTitle>
        <p className="text-sm leading-relaxed text-ink">
          キーを 1 つずつ押していくと、反応したキーが緑になります。ここで読んでいるのは
          <span className="font-semibold">キーマップを通す前のスイッチの状態</span>
          なので、レイヤーキーや割り当てのないキーも反応します。最後まで緑にならないキーは、
          スイッチ・ソケット・FFC・XIAO のピンのどこかで導通していません。
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <Button onClick={stop}>テストを終了{demo ? '' : '（Esc）'}</Button>
          ) : isReady ? (
            <Button
              variant="primary"
              onClick={() => void start({ rows, cols })}
              disabled={phase === 'unlocking'}
            >
              {phase === 'unlocking' ? 'ロック解除中…' : 'テストを開始'}
            </Button>
          ) : (
            <Button variant="primary" onClick={startDemo}>
              デモで試す
            </Button>
          )}
          <Button onClick={clearSeen} disabled={seen.size === 0}>
            記録をクリア
          </Button>
          <Progress done={seen.size} total={BOARD_KEYS.length} />
        </div>

        {phase === 'unlocking' && (
          <p className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink">
            <span className="font-semibold text-accent">ロック解除中</span> — {chordNames} を
            <span className="font-semibold">同時に</span>押してください（
            {chordKeysRemaining > 0 ? `あと ${chordKeysRemaining} キー・` : ''}
            残り {Math.ceil(unlockRemaining / 10)} 秒）。
            ファームウェアはロック中だとスイッチの状態を返さないため、テストの前に一度だけ必要です
            （解除は電源を切るまで持続します）。
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-danger/40 bg-panel px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {running && !demo && (
          <p className="text-xs leading-relaxed text-muted">
            テスト中の入力はこのページ側で止めていますが、⌘ や Ctrl
            を含む組み合わせはブラウザ自体のショートカットが動くことがあります。 また
            <span className="font-medium">右半分は左半分と BLE でつながっている必要があります</span>
            （右の電源スイッチが入っていないと、右のキーは 1 つも反応しません）。
          </p>
        )}
        {running && demo && (
          <p className="text-xs leading-relaxed text-muted">
            デモ表示中です。キーボードは接続されていないので、
            盤面のキーをクリックすると押されたことにします。
          </p>
        )}
      </section>

      <div className="panel px-3 py-4 sm:px-6 sm:py-6">
        <Keyboard
          layer={0}
          keymap={draft}
          definition={definition}
          selected={null}
          tints={tints}
          onSelect={(pos) => demoPress(pos.row, pos.col)}
        />
        <div className="mt-3">
          <Legend />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-5">
          <SectionTitle hint="ファームウェアが返すマトリクス">スキャン結果</SectionTitle>
          <MatrixGrid rows={rows} cols={cols} pressed={pressed} seen={seen} />
        </section>

        <section className="panel flex flex-col gap-3 p-5">
          <SectionTitle hint={`${untested.length} 個`}>まだ反応していないキー</SectionTitle>
          {untested.length === 0 ? (
            <p className="text-sm text-ok">
              全 {BOARD_KEYS.length} キーが反応しました。マトリクスは全数導通しています。
            </p>
          ) : (
            <>
              {summary && <p className="text-sm text-warn">{summary}</p>}
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm text-ink">
                {untested.map((k) => (
                  <li key={keyId(k.row, k.col)} className="flex items-baseline gap-2">
                    <code className="font-mono text-xs text-muted">
                      {k.row},{k.col}
                    </code>
                    <span>{positionLabel(k.row, k.col)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
