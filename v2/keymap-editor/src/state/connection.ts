/**
 * WebHID connection lifecycle.
 *
 * Owns the single `WebHidTransport` and, crucially, **serialises every
 * use of it**: the Vial wire protocol has no request ids, so the
 * transport rejects overlapping `sendAndReceive` calls outright. Feature
 * stores never touch the transport directly — they go through
 * `runOnDevice`, which chains work onto one promise queue.
 */

import { create } from 'zustand';
import { type HandshakeResult, isKobu2Definition, performHandshake } from '../protocol/handshake';
import { TransportError } from '../transport/types';
import {
  getPreviouslyAuthorizedKobuDevices,
  isWebHidSupported,
  requestKobuDevice,
  WebHidTransport,
} from '../transport/webhid';

export type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'connecting' }
  | { kind: 'ready'; transport: WebHidTransport; handshake: HandshakeResult }
  | { kind: 'error'; message: string };

export interface ConnectionStore {
  state: ConnectionState;
  /** Prompt the WebHID picker and connect to whatever the user chooses. */
  connect: () => Promise<void>;
  /** Reconnect silently to an already-authorised board, if one is present. */
  tryAutoConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Internal: called by the navigator-level disconnect listener. */
  handleDeviceLost: (device: HIDDevice) => void;
}

/**
 * Serialisation queue. Every transport-touching call is appended here, so
 * the keymap store and the tuning store can issue work independently
 * without ever colliding on the wire.
 */
let queue: Promise<unknown> = Promise.resolve();

export function runOnDevice<T>(fn: (transport: WebHidTransport) => Promise<T>): Promise<T> {
  const state = useConnectionStore.getState().state;
  if (state.kind !== 'ready') {
    return Promise.reject(new TransportError('disconnected', 'キーボードが接続されていません'));
  }
  const { transport } = state;
  const next = queue.then(
    () => fn(transport),
    () => fn(transport),
  );
  // Keep the chain alive even when a step rejects, otherwise one failure
  // would wedge every later request.
  queue = next.catch(() => undefined);
  return next;
}

function describeError(err: unknown): string {
  if (err instanceof TransportError) {
    switch (err.kind) {
      case 'webhid-unsupported':
        return 'このブラウザは WebHID に対応していません。Chrome / Edge をお使いください。';
      case 'open-failed':
        return 'キーボードを開けませんでした。他のタブやアプリが掴んでいないか確認してください。';
      case 'receive-timeout':
        return 'キーボードから応答がありません。USB を挿し直すか、再接続してください。';
      case 'disconnected':
        return 'キーボードとの接続が切れました。';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function openAndHandshake(device: HIDDevice): Promise<ConnectionState> {
  const transport = await WebHidTransport.open(device);
  try {
    const handshake = await performHandshake(transport);
    if (!handshake.isKobu) {
      await transport.close();
      return { kind: 'error', message: 'kobu ではないキーボードのようです。' };
    }
    if (!isKobu2Definition(handshake.definition)) {
      await transport.close();
      return {
        kind: 'error',
        message:
          'これは kobu v1 のファームウェアです。v2 用エディタでは編集できません（キー配列が異なります）。',
      };
    }
    return { kind: 'ready', transport, handshake };
  } catch (err) {
    await transport.close();
    throw err;
  }
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  state: isWebHidSupported() ? { kind: 'idle' } : { kind: 'unsupported' },

  connect: async () => {
    if (!isWebHidSupported()) {
      set({ state: { kind: 'unsupported' } });
      return;
    }
    set({ state: { kind: 'connecting' } });
    try {
      const device = await requestKobuDevice();
      if (!device) {
        set({ state: { kind: 'idle' } });
        return;
      }
      set({ state: await openAndHandshake(device) });
    } catch (err) {
      set({ state: { kind: 'error', message: describeError(err) } });
    }
  },

  tryAutoConnect: async () => {
    if (!isWebHidSupported()) return;
    if (get().state.kind === 'ready' || get().state.kind === 'connecting') return;
    const devices = await getPreviouslyAuthorizedKobuDevices();
    const device = devices[0];
    if (!device) return;
    set({ state: { kind: 'connecting' } });
    try {
      set({ state: await openAndHandshake(device) });
    } catch {
      // A board that is authorised but not currently powered on is the
      // normal case here — stay quiet and let the user click Connect.
      set({ state: { kind: 'idle' } });
    }
  },

  disconnect: async () => {
    const state = get().state;
    if (state.kind === 'ready') await state.transport.close();
    set({ state: { kind: 'idle' } });
  },

  handleDeviceLost: (device) => {
    const state = get().state;
    if (state.kind === 'ready' && state.transport.device === device) {
      set({ state: { kind: 'idle' } });
    }
  },
}));

/** Attach the navigator-level disconnect listener. Returns an unsubscribe. */
export function watchDeviceDisconnect(): () => void {
  if (!isWebHidSupported()) return () => {};
  const onDisconnect = (e: HIDConnectionEvent) => {
    useConnectionStore.getState().handleDeviceLost(e.device);
  };
  navigator.hid.addEventListener('disconnect', onDisconnect);
  return () => navigator.hid.removeEventListener('disconnect', onDisconnect);
}

export function selectIsReady(s: ConnectionStore): boolean {
  return s.state.kind === 'ready';
}
