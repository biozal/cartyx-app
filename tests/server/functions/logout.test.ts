import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSession = vi.fn()
const mockClearSession = vi.fn()
const mockRevokeToken = vi.fn()
const mockServerCaptureException = vi.fn()
const mockServerCaptureEvent = vi.fn()

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}))

vi.mock('~/server/session', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  clearSession: (...args: unknown[]) => mockClearSession(...args),
  setSession: vi.fn(),
}))

vi.mock('~/server/utils/oauth', () => ({
  revokeToken: (...args: unknown[]) => mockRevokeToken(...args),
  providerConfigured: vi.fn(),
}))

vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: (...args: unknown[]) => mockServerCaptureException(...args),
  serverCaptureEvent: (...args: unknown[]) => mockServerCaptureEvent(...args),
  shutdownPostHog: vi.fn(),
}))

vi.mock('~/server/db/connection', () => ({
  connectDB: vi.fn(),
  isDBConnected: vi.fn().mockReturnValue(true),
}))

vi.mock('~/server/db/models/User', () => ({
  User: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}))

import { logoutFn } from '~/server/functions/auth'

const _logoutFn = logoutFn as unknown as () => Promise<{ success: boolean }>

describe('logoutFn', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockClearSession.mockReset()
    mockRevokeToken.mockReset()
    mockServerCaptureException.mockClear()
    mockServerCaptureEvent.mockClear()
    mockClearSession.mockResolvedValue(undefined)
  })

  it('clears session and returns success on normal logout', async () => {
    mockGetSession.mockResolvedValue({ id: 'user1', provider: 'google' })
    mockRevokeToken.mockResolvedValue(undefined)

    const result = await _logoutFn()

    expect(result.success).toBe(true)
    expect(mockClearSession).toHaveBeenCalled()
    expect(mockServerCaptureEvent).toHaveBeenCalledWith('user1', 'user_logged_out', { provider: 'google' })
  })

  it('still clears session when revokeToken fails', async () => {
    mockGetSession.mockResolvedValue({ id: 'user1', provider: 'google' })
    mockRevokeToken.mockRejectedValue(new Error('provider down'))

    const result = await _logoutFn()

    expect(result.success).toBe(true)
    expect(mockClearSession).toHaveBeenCalled()
    expect(mockServerCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      'user1',
      expect.objectContaining({ action: 'logoutFn', step: 'revokeToken' }),
    )
  })

  it('returns success false and captures exception on clearSession failure', async () => {
    mockGetSession.mockResolvedValue({ id: 'user1', provider: 'google' })
    mockRevokeToken.mockResolvedValue(undefined)
    mockClearSession.mockRejectedValue(new Error('cookie failure'))

    const result = await _logoutFn()

    expect(result.success).toBe(false)
    expect(mockServerCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      'user1',
      expect.objectContaining({ action: 'logoutFn' }),
    )
  })
})
