import '@testing-library/jest-dom/vitest';

// Node 26 ships an experimental built-in `localStorage` that stays
// `undefined` unless the runtime is launched with `--localstorage-file`,
// and that undefined can win over jsdom's polyfill depending on
// initialisation order. Install an in-memory shim up front so anything
// that persists UI preferences sees a working Storage API.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  let store: Record<string, string> = {};
  const shim: Storage = {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key) {
      return Object.hasOwn(store, key) ? (store[key] ?? null) : null;
    },
    key(index) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key) {
      delete store[key];
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  });
}
