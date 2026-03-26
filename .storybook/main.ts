import type { StorybookConfig } from '@storybook/react-vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config: StorybookConfig = {
  stories: ['../app/components/**/*.stories.@(ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
  ],
  framework: '@storybook/react-vite',
  viteFinal: async (config) => {
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
