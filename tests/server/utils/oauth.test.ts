import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockServerCaptureException = vi.fn()
vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: (...args: unknown[]) => mockServerCaptureException(...args),
  serverCaptureEvent: vi.fn(),
  shutdownPostHog: vi.fn(),
}))

const mockFindOneAndUpdate = vi.fn()
vi.mock('~/server/db/models/User', () => ({
  User: { findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args) },
}))

const mockConnectDB = vi.fn()
const mockIsDBConnected = vi.fn(() => true)
vi.mock('~/server/db/connection', () => ({
  connectDB: (...args: unknown[]) => mockConnectDB(...args),
  isDBConnected: () => mockIsDBConnected(),
}))

// Mock fetch globally for revokeToken tests
const originalFetch = globalThis.fetch

describe('upsertUser PostHog logging', () => {
  beforeEach(() => {
    vi.resetModules()
    mockServerCaptureException.mockClear()
    mockFindOneAndUpdate.mockClear()
    mockConnectDB.mockClear()
  })

  it('captures exception to PostHog when DB upsert fails', async () => {
    const dbError = new Error('MongoDB connection lost')
    mockFindOneAndUpdate.mockRejectedValue(dbError)

    const { upsertUser } = await import('~/server/utils/oauth')
    const profile = {
      id: 'google_123',
      provider: 'google' as const,
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      accessToken: 'tok',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    }

    const result = await upsertUser(profile)

    expect(mockServerCaptureException).toHaveBeenCalledWith(
      dbError,
      'google_123',
      { action: 'upsertUser', provider: 'google' },
    )
    // Should still return fallback profile with role 'unknown'
    expect(result.role).toBe('unknown')
  })

  it('does not capture exception on successful upsert', async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      avatarUrl: null,
      role: 'gm',
    })

    const { upsertUser } = await import('~/server/utils/oauth')
    const profile = {
      id: 'github_456',
      provider: 'github' as const,
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      accessToken: 'tok',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    }

    await upsertUser(profile)
    expect(mockServerCaptureException).not.toHaveBeenCalled()
  })
})

describe('revokeToken PostHog logging', () => {
  beforeEach(() => {
    mockServerCaptureException.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('captures exception to PostHog when Google token revocation fails', async () => {
    const fetchError = new Error('Network timeout')
    globalThis.fetch = vi.fn().mockRejectedValue(fetchError)

    const { revokeToken } = await import('~/server/utils/oauth')
    await revokeToken({
      id: 'google_123',
      provider: 'google',
      name: null,
      email: null,
      avatar: null,
      role: 'gm',
      accessToken: 'some-token',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    })

    expect(mockServerCaptureException).toHaveBeenCalledWith(
      fetchError,
      'google_123',
      { action: 'revokeToken', provider: 'google' },
    )
  })

  it('does not capture exception when no access token', async () => {
    globalThis.fetch = vi.fn()

    const { revokeToken } = await import('~/server/utils/oauth')
    await revokeToken({
      id: 'google_123',
      provider: 'google',
      name: null,
      email: null,
      avatar: null,
      role: 'gm',
      accessToken: null,
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    })

    expect(mockServerCaptureException).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('captures exception to PostHog when GitHub token revocation fails', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
    const fetchError = new Error('502 Bad Gateway')
    globalThis.fetch = vi.fn().mockRejectedValue(fetchError)

    const { revokeToken } = await import('~/server/utils/oauth')
    await revokeToken({
      id: 'github_456',
      provider: 'github',
      name: null,
      email: null,
      avatar: null,
      role: 'player',
      accessToken: 'gh-token',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    })

    expect(mockServerCaptureException).toHaveBeenCalledWith(
      fetchError,
      'github_456',
      { action: 'revokeToken', provider: 'github' },
    )

    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
  })
})
