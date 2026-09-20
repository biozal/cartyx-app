// Required even though vitest's defaults would normally discover src/**/*.test.ts:
// when run from realtime/, vitest resolves the repo root's config (unit/storybook
// projects with include tests/**), so without this local config no tests are found.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app modules this service bundles use the app's own `~` alias.
  resolve: { alias: { '~': fileURLToPath(new URL('../app', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
