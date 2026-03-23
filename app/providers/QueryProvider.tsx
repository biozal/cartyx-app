import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  })
}

/** Get a fresh QueryClient for route loaders (SSR-safe, not shared across requests) */
let browserQueryClient: QueryClient | null = null
export function getQueryClient() {
  // On the server, always create a new client (no cross-request leakage)
  if (typeof window === 'undefined') return createQueryClient()
  // In the browser, reuse a single instance
  if (!browserQueryClient) browserQueryClient = createQueryClient()
  return browserQueryClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => getQueryClient())

  return (
    <QueryClientProvider client={client}>
      {children}
      {import.meta.env.DEV && (
        <ReactQueryDevtoolsLazy />
      )}
    </QueryClientProvider>
  )
}

// Lazy-load devtools so they're tree-shaken from production builds
import { lazy, Suspense } from 'react'
const ReactQueryDevtoolsLazyComponent = lazy(() =>
  import('@tanstack/react-query-devtools').then(mod => ({ default: mod.ReactQueryDevtools }))
)
function ReactQueryDevtoolsLazy() {
  return (
    <Suspense fallback={null}>
      <ReactQueryDevtoolsLazyComponent initialIsOpen={false} />
    </Suspense>
  )
}
