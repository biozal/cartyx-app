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
  viteFinal: async (config, { configType }) => {
    // The project vite.config.ts includes nitro() and tanstackStart() which
    // override build.outDir to '.output/public'. Remove these server-side plugins
    // so the Storybook preview build outputs correctly to storybook-static.
    // Strip all app-specific plugins that corrupt the Storybook output dir:
    // nitro overwrites outDir to .output/public, tanstack/start writes the app
    // index.html, and tailwindcss scan/build are only needed for the app.
    if (config.plugins) {
      const blocked = ['nitro', 'tanstack', 'start', '@tailwindcss']
      config.plugins = (config.plugins as any[]).filter((p: any) => {
        if (!p) return true
        const name: string = (Array.isArray(p) ? p[0]?.name : p?.name) ?? ''
        return !blocked.some(b => name.includes(b))
      })
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
    )
    config.resolve.alias = aliasArray
    return config
  },
}
export default config
