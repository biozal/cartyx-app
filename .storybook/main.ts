import type { StorybookConfig } from '@storybook/react-vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
  // Explicitly set staticDirs to empty so Storybook doesn't copy public/index.html
  // over the manager's generated index.html.
  staticDirs: [],
  stories: ['../app/components/**/*.stories.@(ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
  ],
  framework: '@storybook/react-vite',
  viteFinal: async (config, { configType: _configType }) => {
    // The project vite.config.ts includes nitro() and tanstackStart() which
    // override build.outDir to '.output/public'. Remove these server-side plugins
    // so the Storybook preview build outputs correctly to storybook-static.
    // We match exact plugin name prefixes known to corrupt the Storybook build:
    //   nitro:*        — overrides outDir to .output/public
    //   tanstack-*     — writes app index.html to the output dir
    //   @tailwindcss/* — only needed for the app, not for Storybook
    if (config.plugins) {
      // Filter out app-specific plugins that corrupt the Storybook build output.
      // We match by exact name prefixes and only check top-level entries to avoid
      // mutating nested arrays or Promises (which Vite uses internally).
      const BLOCKED_PREFIXES = ['nitro:', 'tanstack-', '@tailwindcss/']
      const isBlocked = (p: unknown): boolean => {
        if (!p || typeof p !== 'object' || !('name' in p)) return false
        const name = (p as { name: string }).name
        return typeof name === 'string' && BLOCKED_PREFIXES.some(prefix => name.startsWith(prefix))
      }
      config.plugins = (config.plugins as import('vite').PluginOption[]).filter(
        p => !isBlocked(p)
      )
    }

    config.plugins = config.plugins ?? []
    config.plugins.push(tsconfigPaths())
    config.resolve = config.resolve ?? {}
    // Use array format for aliases so we can use exact-match regex.
    // A plain string alias for '@tanstack/react-router' also catches
    // subpath imports like '@tanstack/react-router/ssr/server', breaking
    // TanStack Start internals. The regex anchors with $ to match only
    // the bare specifier.
    const existingAlias = config.resolve.alias ?? {}
    const aliasArray = Array.isArray(existingAlias)
      ? existingAlias
      : Object.entries(existingAlias).map(([find, replacement]) => ({ find, replacement }))
    aliasArray.push(
      { find: /^@tanstack\/react-router$/, replacement: path.resolve(__dirname, './mocks/router.tsx') },
      { find: '~/hooks/useAuth', replacement: path.resolve(__dirname, './mocks/useAuth.ts') },
      { find: '~/hooks/useNotes', replacement: path.resolve(__dirname, './mocks/useNotes.ts') },
      { find: '~/hooks/useGMScreens', replacement: path.resolve(__dirname, './mocks/useGMScreens.ts') },
    )
    config.resolve.alias = aliasArray
    return config
  },
}
export default config
