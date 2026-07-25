/// <reference types="vitest/config" />

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// kobu2-keymap-editor is a pure client-side app: every byte it exchanges
// with the keyboard goes over WebHID, so there is no backend and no proxy
// to configure. `base` stays '/' — see v2/web/README.md if this app ever
// gets mounted under a sub-path on the shared Worker.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Vitest's default excludes cover node_modules/dist but not .direnv,
    // which materialises full flake inputs (with their own test files).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.direnv/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.d.ts', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
