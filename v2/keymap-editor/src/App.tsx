import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, type KeyPosition } from './board/Keyboard';
import { positionLabel } from './board/positionLabel';
import { ConnectGate } from './components/ConnectGate';
import { Header } from './components/Header';
import { KeyPicker } from './components/KeyPicker';
import { LayerBar } from './components/LayerBar';
import { SaveBar } from './components/SaveBar';
import { TuningPanel } from './components/TuningPanel';
import { Button, Chip } from './components/ui';
import { useConnectionStore, watchDeviceDisconnect } from './state/connection';
import { dirtyLayers, dirtyOnLayer, useKeymapStore } from './state/keymap';
import { useTuningStore } from './state/tuning';

type Tab = 'keymap' | 'tuning';

const TABS: ReadonlyArray<{ id: Tab; label: string; hint: string }> = [
  { id: 'keymap', label: 'キーマップ', hint: 'キーを押して割り当てを変更' },
  { id: 'tuning', label: 'チューニング', hint: 'カーソル速度など' },
];

function KeymapTab() {
  const layer = useKeymapStore((s) => s.layer);
  const layerCount = useKeymapStore((s) => s.layerCount);
  const draft = useKeymapStore((s) => s.draft);
  const dirty = useKeymapStore((s) => s.dirty);
  const phase = useKeymapStore((s) => s.phase);
  const setLayer = useKeymapStore((s) => s.setLayer);
  const setKey = useKeymapStore((s) => s.setKey);
  const revertCell = useKeymapStore((s) => s.revertCell);
  const definition = useConnectionStore((s) =>
    s.state.kind === 'ready' ? s.state.handshake.definition : undefined,
  );

  const [selected, setSelected] = useState<KeyPosition>({ row: 0, col: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);

  const layerDirty = useMemo(() => dirtyOnLayer(dirty, layer), [dirty, layer]);
  const touchedLayers = useMemo(() => dirtyLayers(dirty), [dirty]);

  const currentCode = draft?.[layer]?.[selected.row]?.[selected.col];
  const cell = { layer, row: selected.row, col: selected.col };
  const isCellDirty = layerDirty.has(`${selected.row},${selected.col}`);

  if (phase === 'loading' || phase === 'idle') {
    return <p className="py-16 text-center text-sm text-muted">キーマップを読み込んでいます…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <LayerBar
        layer={layer}
        layerCount={layerCount}
        dirtyLayers={touchedLayers}
        onSelect={setLayer}
      />

      <div className="panel px-3 py-4 sm:px-6 sm:py-6">
        <Keyboard
          layer={layer}
          keymap={draft}
          definition={definition}
          selected={selected}
          dirty={layerDirty}
          onSelect={setSelected}
          onActivate={() =>
            pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        />
        <p className="mt-3 text-center text-xs text-muted">
          変更したいキーをクリックしてください。矢印キーでも移動できます。
        </p>
      </div>

      <div ref={pickerRef}>
        <KeyPicker
          positionLabel={positionLabel(selected.row, selected.col)}
          currentCode={currentCode}
          layerCount={layerCount}
          definition={definition}
          isDirty={isCellDirty}
          onAssign={(code) => setKey(cell, code)}
          onRevert={() => revertCell(cell)}
        />
      </div>

      <SaveBar />
    </div>
  );
}

function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3">
      <p className="flex-1 text-sm text-ink">
        <span className="font-semibold text-accent">デモ表示</span> —
        キーボードは接続されていません。レイヤー 0
        は出荷時のキーマップですが、他のレイヤーはサンプル（すべて透過）です。書き込みはできません。
      </p>
      <Button onClick={onExit}>接続画面に戻る</Button>
    </div>
  );
}

export default function App() {
  const state = useConnectionStore((s) => s.state);
  const tryAutoConnect = useConnectionStore((s) => s.tryAutoConnect);
  const loadKeymap = useKeymapStore((s) => s.load);
  const loadKeymapDemo = useKeymapStore((s) => s.loadDemo);
  const resetKeymap = useKeymapStore((s) => s.reset);
  const loadTuning = useTuningStore((s) => s.load);
  const loadTuningDemo = useTuningStore((s) => s.loadDemo);
  const resetTuning = useTuningStore((s) => s.reset);

  const [tab, setTab] = useState<Tab>('keymap');
  const [demo, setDemo] = useState(false);

  useEffect(() => watchDeviceDisconnect(), []);
  useEffect(() => {
    void tryAutoConnect();
  }, [tryAutoConnect]);

  // Pull everything the editor needs the moment a board is ready, and drop it
  // again on disconnect so a reconnect never shows stale contents. Demo data
  // is left alone — it has no device behind it to go stale.
  useEffect(() => {
    if (state.kind === 'ready') {
      setDemo(false);
      const definition = state.handshake.definition;
      void (async () => {
        await loadKeymap(definition);
        await loadTuning();
      })();
      return;
    }
    if (!demo) {
      resetKeymap();
      resetTuning();
    }
  }, [state, demo, loadKeymap, loadTuning, resetKeymap, resetTuning]);

  const startDemo = useCallback(() => {
    loadKeymapDemo();
    loadTuningDemo();
    setDemo(true);
  }, [loadKeymapDemo, loadTuningDemo]);

  const exitDemo = useCallback(() => {
    setDemo(false);
    resetKeymap();
    resetTuning();
  }, [resetKeymap, resetTuning]);

  const showEditor = state.kind === 'ready' || demo;

  return (
    <div className="min-h-screen">
      <Header />
      {showEditor ? (
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          {demo && <DemoBanner onExit={exitDemo} />}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <Chip key={t.id} active={tab === t.id} title={t.hint} onClick={() => setTab(t.id)}>
                {t.label}
              </Chip>
            ))}
          </div>
          {tab === 'keymap' ? <KeymapTab /> : <TuningPanel />}
        </main>
      ) : (
        <ConnectGate onDemo={startDemo} />
      )}
    </div>
  );
}
