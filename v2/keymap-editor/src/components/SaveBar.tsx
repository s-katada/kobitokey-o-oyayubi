import { useKeymapStore } from '../state/keymap';
import { Button } from './ui';

/**
 * Sticky write bar.
 *
 * Edits stay local until you press 書き込む, which is also where the Vial
 * unlock chord gets handled — the firmware rejects keymap writes on a
 * locked board, so the bar turns into a "hold these keys" prompt while
 * that runs.
 */
export function SaveBar() {
  const dirty = useKeymapStore((s) => s.dirty);
  const phase = useKeymapStore((s) => s.phase);
  const error = useKeymapStore((s) => s.error);
  const unlock = useKeymapStore((s) => s.unlock);
  const save = useKeymapStore((s) => s.save);
  const discard = useKeymapStore((s) => s.discardEdits);
  const demo = useKeymapStore((s) => s.demo);

  const count = dirty.size;
  const saving = phase === 'saving';
  const holding = saving && unlock.phase === 'holding';

  if (count === 0 && !error) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-line bg-canvas/92 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3">
        {holding ? (
          <p className="flex-1 text-sm text-ink">
            <span className="font-semibold text-accent">ロック解除中</span> — キーボードの
            <span className="font-semibold">左右いちばん外側の小指キー</span>
            を同時に押したままにしてください（残り {Math.ceil(unlock.remaining / 10)} 秒）
          </p>
        ) : (
          <p className="flex-1 text-sm text-ink">
            {count > 0 ? (
              <>
                <span className="font-semibold">{count} 個</span> のキーが未書き込みです
              </>
            ) : (
              <span className="text-muted">変更はありません</span>
            )}
          </p>
        )}

        {error && !saving && (
          <p className="w-full text-sm text-danger sm:w-auto sm:flex-1">{error}</p>
        )}

        <Button onClick={discard} disabled={saving || count === 0}>
          変更を破棄
        </Button>
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={saving || count === 0 || demo}
          title={demo ? 'デモ表示中は書き込めません' : undefined}
        >
          {saving ? '書き込んでいます…' : demo ? '書き込み（実機が必要）' : 'キーボードに書き込む'}
        </Button>
      </div>
    </div>
  );
}
