import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  // The app modules this service bundles use the app's own `~` alias.
  resolve: { alias: { '~': fileURLToPath(new URL('../app', import.meta.url)) } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
