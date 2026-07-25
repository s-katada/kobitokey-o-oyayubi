/**
 * Live device tuning over Via Custom Channel 0xC0.
 *
 * Unlike the keymap, these writes need no unlock and take effect the
 * instant the firmware stores the atomic — so a slider can drive the
 * real trackball while you drag it. Writes are coalesced per key so a
 * drag issues a handful of HID round trips rather than one per pixel.
 *
 * ⚠ The firmware does NOT persist these (see `config.rs`): a reboot
 * restores the built-in defaults. The panel says so.
 */

import { create } from 'zustand';
import {
  fetchKobuSettings,
  getKobuValue,
  KOBU_VALUES,
  type KobuSettingKey,
  setKobuValue,
} from '../protocol/customValue';
import { runOnDevice } from './connection';

/** Ids the firmware reports but never accepts a write for. */
export const READ_ONLY_KEYS: ReadonlySet<KobuSettingKey> = new Set([
  'central_battery_percent',
  'peripheral_battery_percent',
]);

const WRITE_DEBOUNCE_MS = 90;

export type TuningPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface TuningStore {
  phase: TuningPhase;
  error: string | null;
  values: Partial<Record<KobuSettingKey, number>>;
  /** Keys with a write still in flight or scheduled. */
  pending: ReadonlySet<KobuSettingKey>;
  /** True when showing firmware defaults offline instead of a real board. */
  demo: boolean;

  load: () => Promise<void>;
  /** Show the firmware defaults with no device attached. */
  loadDemo: () => void;
  reset: () => void;
  setValue: (key: KobuSettingKey, value: number) => void;
  /** Re-read just the two battery gauges. */
  refreshBattery: () => Promise<void>;
  /** Put every writable setting back to the firmware default. */
  restoreDefaults: () => void;
}

const timers = new Map<KobuSettingKey, ReturnType<typeof setTimeout>>();

function defOf(key: KobuSettingKey) {
  return KOBU_VALUES.find((v) => v.key === key);
}

export const useTuningStore = create<TuningStore>((set, get) => ({
  phase: 'idle',
  error: null,
  values: {},
  pending: new Set<KobuSettingKey>(),
  demo: false,

  loadDemo: () => {
    const values: Partial<Record<KobuSettingKey, number>> = {};
    for (const def of KOBU_VALUES) values[def.key] = def.default;
    set({ phase: 'ready', error: null, demo: true, values, pending: new Set<KobuSettingKey>() });
  },

  load: async () => {
    set({ phase: 'loading', error: null });
    try {
      const values = await runOnDevice((t) => fetchKobuSettings(t));
      set({ phase: 'ready', demo: false, values });
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  reset: () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    set({
      phase: 'idle',
      error: null,
      demo: false,
      values: {},
      pending: new Set<KobuSettingKey>(),
    });
  },

  setValue: (key, value) => {
    const def = defOf(key);
    if (!def || READ_ONLY_KEYS.has(key)) return;
    const clamped = Math.max(def.min, Math.min(def.max, Math.round(value)));

    // Optimistic: the slider must track the pointer, not the wire.
    set((s) => ({
      values: { ...s.values, [key]: clamped },
      pending: get().demo ? s.pending : new Set(s.pending).add(key),
    }));

    // Offline demo: move the control, but there is nothing to write to.
    if (get().demo) return;

    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        // Read the latest value at flush time so a fast drag sends only
        // where the user actually let go.
        const latest = get().values[key] ?? clamped;
        runOnDevice((t) => setKobuValue(t, def, latest))
          .then(() => {
            set((s) => {
              const pending = new Set(s.pending);
              pending.delete(key);
              return { pending, error: null };
            });
          })
          .catch((err: unknown) => {
            set((s) => {
              const pending = new Set(s.pending);
              pending.delete(key);
              return {
                pending,
                error: err instanceof Error ? err.message : String(err),
              };
            });
          });
      }, WRITE_DEBOUNCE_MS),
    );
  },

  refreshBattery: async () => {
    if (get().demo) return;
    const defs = KOBU_VALUES.filter((v) => READ_ONLY_KEYS.has(v.key));
    try {
      const readings = await runOnDevice(async (t) => {
        const out: Partial<Record<KobuSettingKey, number>> = {};
        for (const def of defs) out[def.key] = await getKobuValue(t, def);
        return out;
      });
      set((s) => ({ values: { ...s.values, ...readings } }));
    } catch {
      // A dropped battery poll is not worth surfacing; the next tick retries.
    }
  },

  restoreDefaults: () => {
    for (const def of KOBU_VALUES) {
      if (READ_ONLY_KEYS.has(def.key)) continue;
      get().setValue(def.key, def.default);
    }
  },
}));
