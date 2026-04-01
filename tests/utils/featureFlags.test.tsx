import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FeatureFlagGate,
  useFeatureFlag,
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
  useFeatureFlagVariant,
  useOptionalFeatureFlagEnabled,
} from '~/utils/featureFlags'

const {
  mockUsePostHogFeatureFlagEnabled,
  mockUsePostHogFeatureFlagPayload,
  mockUseFeatureFlagVariantKey,
} = vi.hoisted(() => ({
  mockUsePostHogFeatureFlagEnabled: vi.fn(),
  mockUsePostHogFeatureFlagPayload: vi.fn(),
  mockUseFeatureFlagVariantKey: vi.fn(),
}))

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: mockUsePostHogFeatureFlagEnabled,
  useFeatureFlagPayload: mockUsePostHogFeatureFlagPayload,
  useFeatureFlagVariantKey: mockUseFeatureFlagVariantKey,
}))

function OptionalFlagProbe({ flag }: { flag: string }) {
  const enabled = useOptionalFeatureFlagEnabled(flag)
  return <div data-testid="result">{String(enabled)}</div>
}

function FeatureFlagStateProbe({ flag }: { flag: string }) {
  const state = useFeatureFlag(flag)
  const enabled = useFeatureFlagEnabled(flag)
  const payload = useFeatureFlagPayload<{ beta: boolean }>(flag)
  const variant = useFeatureFlagVariant(flag)

  return (
    <>
      <div data-testid="state">{JSON.stringify(state)}</div>
      <div data-testid="enabled">{String(enabled)}</div>
      <div data-testid="payload">{JSON.stringify(payload)}</div>
      <div data-testid="variant">{String(variant)}</div>
    </>
  )
}

describe('featureFlags utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces loading state until PostHog resolves a flag', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(undefined)
    mockUsePostHogFeatureFlagPayload.mockReturnValue(undefined)
    mockUseFeatureFlagVariantKey.mockReturnValue(undefined)

    render(<FeatureFlagStateProbe flag="campaign-redesign" />)

    expect(screen.getByTestId('state')).toHaveTextContent(
      '{"isEnabled":false,"isLoading":true,"payload":null}'
    )
    expect(screen.getByTestId('enabled')).toHaveTextContent('false')
    expect(screen.getByTestId('payload')).toHaveTextContent('null')
    expect(screen.getByTestId('variant')).toHaveTextContent('undefined')
  })

  it('returns enabled flag metadata once PostHog has evaluated the flag', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(true)
    mockUsePostHogFeatureFlagPayload.mockReturnValue({ beta: true })
    mockUseFeatureFlagVariantKey.mockReturnValue('variant-a')

    render(<FeatureFlagStateProbe flag="campaign-redesign" />)

    expect(screen.getByTestId('state')).toHaveTextContent(
      '{"isEnabled":true,"isLoading":false,"payload":{"beta":true},"variant":"variant-a"}'
    )
    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('payload')).toHaveTextContent('{"beta":true}')
    expect(screen.getByTestId('variant')).toHaveTextContent('variant-a')
  })

  it('renders fallback content when a flag is disabled', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(false)
    mockUsePostHogFeatureFlagPayload.mockReturnValue(undefined)
    mockUseFeatureFlagVariantKey.mockReturnValue(undefined)

    render(
      <FeatureFlagGate flag="campaign-redesign" fallback={<span>coming soon</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    )

    expect(screen.queryByText('enabled content')).not.toBeInTheDocument()
    expect(screen.getByText('coming soon')).toBeInTheDocument()
  })

  it('does not render fallback while a flag is loading by default', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(undefined)
    mockUsePostHogFeatureFlagPayload.mockReturnValue(undefined)
    mockUseFeatureFlagVariantKey.mockReturnValue(undefined)

    render(
      <FeatureFlagGate flag="campaign-redesign" fallback={<span>coming soon</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    )

    expect(screen.queryByText('enabled content')).not.toBeInTheDocument()
    expect(screen.queryByText('coming soon')).not.toBeInTheDocument()
  })

  it('can render fallback while a flag is loading when requested', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(undefined)
    mockUsePostHogFeatureFlagPayload.mockReturnValue(undefined)
    mockUseFeatureFlagVariantKey.mockReturnValue(undefined)

    render(
      <FeatureFlagGate
        flag="campaign-redesign"
        fallback={<span>coming soon</span>}
        showFallbackWhileLoading
      >
        <span>enabled content</span>
      </FeatureFlagGate>
    )

    expect(screen.queryByText('enabled content')).not.toBeInTheDocument()
    expect(screen.getByText('coming soon')).toBeInTheDocument()
  })

  describe('useOptionalFeatureFlagEnabled', () => {
    it('returns false for an empty flag name without querying PostHog with an empty string', () => {
      render(<OptionalFlagProbe flag="" />)
      expect(screen.getByTestId('result')).toHaveTextContent('false')
      // PostHog should have been called with the sentinel, not an empty string
      expect(mockUsePostHogFeatureFlagEnabled).not.toHaveBeenCalledWith('')
    })

    it('returns false when PostHog returns false for a non-empty flag name', () => {
      mockUsePostHogFeatureFlagEnabled.mockReturnValue(false)
      render(<OptionalFlagProbe flag="inspector-chat" />)
      expect(screen.getByTestId('result')).toHaveTextContent('false')
    })

    it('returns false when PostHog returns undefined (loading) for a non-empty flag name', () => {
      mockUsePostHogFeatureFlagEnabled.mockReturnValue(undefined)
      render(<OptionalFlagProbe flag="inspector-chat" />)
      expect(screen.getByTestId('result')).toHaveTextContent('false')
    })

    it('returns true when PostHog returns true for a non-empty flag name', () => {
      mockUsePostHogFeatureFlagEnabled.mockReturnValue(true)
      render(<OptionalFlagProbe flag="inspector-chat" />)
      expect(screen.getByTestId('result')).toHaveTextContent('true')
    })
  })

  it('renders children when a flag is enabled', () => {
    mockUsePostHogFeatureFlagEnabled.mockReturnValue(true)
    mockUsePostHogFeatureFlagPayload.mockReturnValue(undefined)
    mockUseFeatureFlagVariantKey.mockReturnValue(undefined)

    render(
      <FeatureFlagGate flag="campaign-redesign" fallback={<span>coming soon</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    )

    expect(screen.getByText('enabled content')).toBeInTheDocument()
    expect(screen.queryByText('coming soon')).not.toBeInTheDocument()
  })
})
