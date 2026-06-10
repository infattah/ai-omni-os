import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The React plugin transforms JSX/TSX so client component tests can render. Server tests stay in the
  // default `node` environment; component tests opt into jsdom per-file via a
  // `// @vitest-environment jsdom` docblock, so the fast node suite is unaffected.
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', 'tmp/**'],
  },
});
