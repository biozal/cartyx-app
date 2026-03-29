import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogProvider } from '~/providers/PostHogProvider'

let posthogReady = false
let routeResolvedHandler: ((event: { toLocation: { href: string } }) => void) | null = null

const {
  mockSubscribe,
  mockUseAuthContext,
  mockReactPostHogProvider,
  mockPosthog,
  mockCapturePageView,
  mockSetPostHogInstance,
} = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockUseAuthContext: vi.fn(),
  mockReactPostHogProvider: vi.fn(({ children }: { children: ReactNode }) => (
    <div data-testid="react-posthog-provider">{children}</div>
  )),
  mockPosthog: {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    reloadFeatureFlags: vi.fn(),
  },
  mockCapturePageView: vi.fn(),
  mockSetPostHogInstance: vi.fn(() => {
    posthogReady = true
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    subscribe: mockSubscribe.mockImplementation((_event: string, handler: typeof routeResolvedHandler) => {
      routeResolvedHandler = handler
      return vi.fn()
    }),
  }),
}))

vi.mock('@posthog/react', () => ({
  PostHogProvider: mockReactPostHogProvider,
}))

vi.mock('posthog-js', () => ({
  default: mockPosthog,
}))

vi.mock('~/providers/AuthProvider', () => ({
  useAuthContext: mockUseAuthContext,
}))

vi.mock('~/utils/posthog-client', () => ({
  captureException: vi.fn(),
  captureEvent: vi.fn(),
  capturePageView: mockCapturePageView,
  isPostHogReady: vi.fn(() => posthogReady),
  setPostHogInstance: mockSetPostHogInstance,
}))

describe('PostHogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com')
    posthogReady = false
    routeResolvedHandler = null
    mockUseAuthContext.mockReturnValue({
      user: {
        id: 'user-1',
        name: 'Taryon',
        email: 'taryon@example.com',
        provider: 'google',
        role: 'gm',
      },
    })
  })

  it('initializes PostHog, wires the React provider, and tracks page views', () => {
    render(
      <PostHogProvider>
        <div>children</div>
      </PostHogProvider>
    )

    expect(mockReactPostHogProvider).toHaveBeenCalledWith(
      expect.objectContaining({ client: mockPosthog }),
      undefined
    )
    expect(mockPosthog.init).toHaveBeenCalledWith('test-key', {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: false,
      persistence: 'localStorage+cookie',
      capture_exceptions: true,
    })
    expect(mockSetPostHogInstance).toHaveBeenCalledWith(mockPosthog)
    expect(mockCapturePageView).toHaveBeenCalledWith('http://localhost:3000/')
    expect(mockSubscribe).toHaveBeenCalledWith('onResolved', expect.any(Function))
    expect(screen.getByText('children')).toBeInTheDocument()

    routeResolvedHandler?.({ toLocation: { href: '/campaigns/demo' } })

    expect(mockCapturePageView).toHaveBeenLastCalledWith('http://localhost:3000/campaigns/demo')
  })

  it('identifies authenticated users and refreshes feature flags', () => {
    render(
      <PostHogProvider>
        <div />
      </PostHogProvider>
    )

    expect(mockPosthog.identify).toHaveBeenCalledWith('user-1', {
      name: 'Taryon',
      email: 'taryon@example.com',
      provider: 'google',
      role: 'gm',
    })
    expect(mockPosthog.reloadFeatureFlags).toHaveBeenCalledTimes(1)
  })

  it('resets anonymous sessions and refreshes feature flags', () => {
    mockUseAuthContext.mockReturnValue({ user: null })

    render(
      <PostHogProvider>
        <div />
      </PostHogProvider>
    )

    expect(mockPosthog.reset).toHaveBeenCalledTimes(1)
    expect(mockPosthog.reloadFeatureFlags).toHaveBeenCalledTimes(1)
  })
})
