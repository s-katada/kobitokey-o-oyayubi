import { Keyboard } from '../board/Keyboard';
import { useConnectionStore } from '../state/connection';
import { Button } from './ui';

/**
 * Pre-connection screen. Shows the real board (inert, no keymap) so the
 * first thing you see is your keyboard, then one obvious action.
 */
export function ConnectGate({ onDemo }: { onDemo: () => void }) {
  const state = useConnectionStore((s) => s.state);
  const connect = useConnectionStore((s) => s.connect);
  const unsupported = state.kind === 'unsupported';

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-10 text-center sm:py-16">
      <div aria-hidden className="pointer-events-none w-full max-w-3xl opacity-45 grayscale-[0.35]">
        <Keyboard layer={0} keymap={null} selected={null} onSelect={() => {}} />
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">
        キーボードを繋いでください
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        kobu2 を USB で接続し、下のボタンを押して表示されたリストから選択してください。
        キーマップとトラックボールの設定を、この画面から直接編集できます。
      </p>
      <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
        USB ケーブルは<span className="font-medium text-ink">左手側（セントラル）</span>に挿してください。
        右手側は USB デバイスとして現れません — 右手のキーは、右手が左手に BLE
        で繋がっていれば（接続時に右手の LED が青く光ります）この画面からテストできます。
      </p>

      {unsupported ? (
        <div className="mt-8 rounded-2xl border border-danger/40 bg-panel px-5 py-4 text-sm text-ink">
          <p className="font-medium text-danger">このブラウザは WebHID に対応していません</p>
          <p className="mt-1.5 text-muted">
            Chrome、Edge、Arc など Chromium 系のデスクトップブラウザでお試しください。
          </p>
        </div>
      ) : (
        <Button
          variant="primary"
          className="mt-8 px-6 py-3 text-base"
          onClick={() => void connect()}
          disabled={state.kind === 'connecting'}
        >
          {state.kind === 'connecting' ? '接続しています…' : 'キーボードに接続'}
        </Button>
      )}

      {state.kind === 'error' && (
        <p className="mt-5 max-w-xl rounded-xl border border-danger/40 bg-panel px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}

      <button
        type="button"
        onClick={onDemo}
        className="mt-5 text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        キーボードなしで中身を見る（デモ）
      </button>

      <p className="mt-10 text-xs text-muted">
        このエディタは v2（kobu2 / 片手 20 キー）専用です。小指列の最下段キーが無い初代 kobu は{' '}
        <a href="/" className="underline underline-offset-2 hover:text-ink">
          v1 のエディタ
        </a>
        をお使いください。
      </p>
    </div>
  );
}
