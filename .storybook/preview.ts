import type { Preview } from '@storybook/react-vite'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../app/styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const preview: Preview = {
  decorators: [
    (Story) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          'div',
          { className: 'min-h-[200px] bg-[#080A12] p-8' },
          React.createElement(Story)
        )
      ),
  ],
  parameters: {
    backgrounds: {
      default: 'cartyx-dark',
      values: [
        { name: 'cartyx-dark', value: '#080A12' },
        { name: 'cartyx-surface', value: '#0D1117' },
        { name: 'white', value: '#ffffff' },
      ],
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
}
export default preview
