import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GMScreenData, GMScreenDetailData } from '~/server/functions/gmscreens'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockScreens: GMScreenData[] = [
  { id: 'scr-a', campaignId: 'c1', name: 'Alpha', tabOrder: 0, createdBy: 'u1', createdAt: '', updatedAt: '' },
  { id: 'scr-b', campaignId: 'c1', name: 'Bravo', tabOrder: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
  { id: 'scr-c', campaignId: 'c1', name: 'Charlie', tabOrder: 2, createdBy: 'u1', createdAt: '', updatedAt: '' },
]

const mockDetail: GMScreenDetailData = {
  ...mockScreens[0],
  windows: [],
  stacks: [],
  hydrated: {},
}

const mockInvalidateList = vi.fn()
const mockInvalidateDetail = vi.fn()
const noopMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  error: null as Error | null,
}

let listResult: { screens: GMScreenData[]; isLoading: boolean; error: string | null } =
  { screens: mockScreens, isLoading: false, error: null }
let detailResult: { screen: GMScreenDetailData | null; isLoading: boolean; error: string | null } =
  { screen: mockDetail, isLoading: false, error: null }

vi.mock('~/hooks/useGMScreens', () => ({
  useGMScreenList: () => listResult,
  useGMScreenDetail: (_cid: string, _sid: string | null) => detailResult,
  useGMScreenMutations: () => ({
    createScreen: { ...noopMutation },
    renameScreen: { ...noopMutation },
    deleteScreen: { ...noopMutation },
    reorderScreens: { ...noopMutation },
    openWindow: { ...noopMutation },
    updateWindow: { ...noopMutation },
    closeWindow: { ...noopMutation },
    createStack: { ...noopMutation },
    renameStack: { ...noopMutation },
    moveStack: { ...noopMutation },
    deleteStack: { ...noopMutation },
    addStackItem: { ...noopMutation },
    removeStackItem: { ...noopMutation },
    invalidateList: mockInvalidateList,
    invalidateDetail: mockInvalidateDetail,
  }),
}))

// Lazy import after mocks are set up
import { GMScreensView } from '~/components/mainview/gmscreens/GMScreensView'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GMScreensView — screen selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listResult = { screens: mockScreens, isLoading: false, error: null }
    detailResult = { screen: mockDetail, isLoading: false, error: null }
  })

  it('auto-selects the first screen by tab order on mount', async () => {
    render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })

    await waitFor(() => {
      const tab = screen.getByTestId('screen-tab-scr-a')
      expect(tab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('does NOT re-run selection when screen order changes but set stays the same', async () => {
    const { rerender } = render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })

    // First render — selects scr-a
    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-a')).toHaveAttribute('aria-selected', 'true')
    })

    // Simulate clicking scr-b
    act(() => {
      screen.getByTestId('screen-tab-scr-b').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-b')).toHaveAttribute('aria-selected', 'true')
    })

    // Screens re-arrive in a different order but same set — selection should stay on scr-b
    listResult = {
      screens: [mockScreens[2], mockScreens[0], mockScreens[1]],
      isLoading: false,
      error: null,
    }
    rerender(<GMScreensView campaignId="c1" />)

    // scr-b should remain active (sorted key unchanged → effect doesn't fire)
    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-b')).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('falls back to first screen when active screen is removed from the set', async () => {
    const { rerender } = render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })

    // Select scr-b
    act(() => {
      screen.getByTestId('screen-tab-scr-b').click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-b')).toHaveAttribute('aria-selected', 'true')
    })

    // Remove scr-b from the list
    listResult = {
      screens: [mockScreens[0], mockScreens[2]],
      isLoading: false,
      error: null,
    }
    rerender(<GMScreensView campaignId="c1" />)

    // Should fall back to the first screen (scr-a)
    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-a')).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('clears selection when all screens are removed', async () => {
    const { rerender } = render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('screen-tab-scr-a')).toHaveAttribute('aria-selected', 'true')
    })

    listResult = { screens: [], isLoading: false, error: null }
    rerender(<GMScreensView campaignId="c1" />)

    await waitFor(() => {
      expect(screen.queryByTestId('screen-tab-scr-a')).not.toBeInTheDocument()
    })
  })

  it('shows loading state while list is loading', () => {
    listResult = { screens: [], isLoading: true, error: null }
    render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })
    expect(screen.getByTestId('gmscreens-loading')).toBeInTheDocument()
  })

  it('shows error state on list error', () => {
    listResult = { screens: [], isLoading: false, error: 'Failed to load' }
    render(<GMScreensView campaignId="c1" />, { wrapper: Wrapper })
    expect(screen.getByTestId('gmscreens-error')).toBeInTheDocument()
  })
})
