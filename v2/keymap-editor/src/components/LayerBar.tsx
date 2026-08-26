/**
 * Layer selector.
 *
 * Names mirror the layer comments in `v2/firmware/rmk/keyboard.toml`, so
 * the tabs read the same as the firmware source. Any layer beyond the
 * known set falls back to its index — the firmware reports the real count
 * at handshake, we never assume 7.
 */

const LAYER_NAMES = ['Mac', 'Win', '数字', '設定', 'マウス', 'Emacs', 'Neovim', 'Linux'] as const;

export function layerName(index: number): string {
  return LAYER_NAMES[index] ?? `レイヤー ${index}`;
}

/**
 * `[0, 1, … count-1]`. Mapping over the values rather than over
 * `Array.from({length})` keeps React keys tied to the layer number itself,
 * which is the stable identity here.
 */
export function layerIndices(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

export interface LayerBarProps {
  layer: number;
  layerCount: number;
  dirtyLayers: ReadonlySet<number>;
  onSelect: (layer: number) => void;
}

export function LayerBar({ layer, layerCount, dirtyLayers, onSelect }: LayerBarProps) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-panel p-1.5"
      role="tablist"
      aria-label="レイヤー"
    >
      {layerIndices(layerCount).map((i) => {
        const active = i === layer;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(i)}
            className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${
              active
                ? 'bg-accent text-accent-ink font-semibold'
                : 'text-muted hover:bg-panel-2 hover:text-ink'
            }`}
          >
            <span
              className={`font-mono text-xs ${active ? 'opacity-80' : 'opacity-60'}`}
              aria-hidden
            >
              {i}
            </span>
            {layerName(i)}
            {dirtyLayers.has(i) && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-accent-ink' : 'bg-accent'}`}
                title="未書き込みの変更があります"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
