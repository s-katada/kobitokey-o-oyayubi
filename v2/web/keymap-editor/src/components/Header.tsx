import { useEffect, useState } from 'react';
import { applyTheme, readStoredChoice, type ThemeChoice, watchSystemTheme } from '../lib/theme';
import { useConnectionStore } from '../state/connection';
import { Button } from './ui';

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'システム',
  light: 'ライト',
  dark: 'ダーク',
};
const THEME_ICON: Record<ThemeChoice, string> = { system: '◐', light: '☀', dark: '☾' };

function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readStoredChoice());

  useEffect(() => {
    if (choice !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [choice]);

  const cycle = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length] ?? 'system';
    setChoice(next);
    applyTheme(next);
  };

  return (
    <Button variant="ghost" onClick={cycle} title={`表示テーマ: ${THEME_LABEL[choice]}`}>
      <span aria-hidden className="text-base leading-none">
        {THEME_ICON[choice]}
      </span>
      <span className="sr-only">表示テーマを切り替え（現在: {THEME_LABEL[choice]}）</span>
    </Button>
  );
}

function StatusPill() {
  const state = useConnectionStore((s) => s.state);
  const map = {
    ready: { dot: 'bg-ok', text: '接続中' },
    connecting: { dot: 'bg-warn animate-pulse', text: '接続しています…' },
    error: { dot: 'bg-danger', text: 'エラー' },
    idle: { dot: 'bg-muted/50', text: '未接続' },
    unsupported: { dot: 'bg-danger', text: '非対応ブラウザ' },
  } as const;
  const v = map[state.kind];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink">
      <span className={`h-2 w-2 rounded-full ${v.dot}`} />
      {v.text}
    </span>
  );
}

export function Header() {
  const state = useConnectionStore((s) => s.state);
  const disconnect = useConnectionStore((s) => s.disconnect);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-lg font-semibold tracking-tight">kobu2</span>
          <span className="truncate text-sm text-muted">キーマップエディタ</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill />
          {state.kind === 'ready' && (
            <Button variant="ghost" onClick={() => void disconnect()}>
              切断
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
