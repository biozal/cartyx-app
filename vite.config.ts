import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    nitro({
      // Bundled into the ESM server output, gremlin's requests fail (the /readyz
      // graph probe never passes; verified on a production build 2026-09-19) while
      // the same code works unbundled, so it is traced as an external dependency
      // instead — as the MongoDB driver had to be.
      traceDeps: ['gremlin'],
    }),
    tanstackStart({
      srcDirectory: 'app',
    }),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    tailwindcss(),
  ],
});
