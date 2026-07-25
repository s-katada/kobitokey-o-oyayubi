/**
 * Light / dark theme, stored per-origin.
 *
 * `data-theme` on <html> is the single source of truth — the Tailwind
 * `dark:` variant keys off it (see index.css). "system" resolves once at
 * load and then follows OS changes while the tab is open.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'kobu2-editor.theme';

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function readStoredChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private-mode Safari and friends throw on access; fall through.
  }
  return 'system';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light';
  return choice;
}

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
  }
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Preference is a nicety; never let storage failure break the app.
  }
  return resolved;
}

/** Called once from main.tsx before React mounts, to avoid a flash. */
export function applyStoredTheme(): ResolvedTheme {
  return applyTheme(readStoredChoice());
}

/**
 * Keep "system" honest while the tab is open. Returns an unsubscribe fn;
 * a no-op when the browser has no matchMedia (jsdom without a shim).
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
