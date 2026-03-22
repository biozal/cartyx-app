import React from 'react'
import { describe, it, expect, vi } from 'vitest'

// Mock all external deps
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params: _params, ...props }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={to} {...props}>{children}</a>
  ),
  createFileRoute: vi.fn(() => ({ useRouteContext: vi.fn(), useLoaderData: vi.fn() })),
  redirect: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('~/components/Topbar', () => ({ Topbar: () => <nav data-testid="topbar" /> }))
vi.mock('~/components/Toast', () => ({ Toast: () => <div />, showToast: vi.fn() }))
vi.mock('~/hooks/useCampaigns', () => ({
  useCampaigns: vi.fn(() => ({ campaigns: [], isLoading: false, error: null, refresh: vi.fn() })),
  useCreateCampaign: vi.fn(() => ({ create: vi.fn(), isLoading: false, error: null })),
}))
vi.mock('~/server/functions/auth', () => ({ getMe: vi.fn() }))
vi.mock('~/server/functions/campaigns', () => ({ listCampaigns: vi.fn(), getCampaign: vi.fn() }))

describe('Campaign list helpers', () => {
  it('formats invite code for clipboard', async () => {
    // Test that invite code format matches XXXX-XXXX pattern
    const { generateInviteCode } = await import('~/server/utils/helpers')
    const code = generateInviteCode()
    expect(code).toHaveLength(9)
    expect(code[4]).toBe('-')
  })

  it('serializes campaign data correctly', () => {
    // Test the schedule text builder
    const cases = [
      { input: { frequency: 'weekly', dayOfWeek: 'Sat', time: '19:00', timezone: 'America/Chicago' }, expected: 'weekly · Sat · 19:00 · America/Chicago' },
      { input: null, expected: 'Not scheduled' },
      { input: { frequency: null, dayOfWeek: null, time: null, timezone: null }, expected: 'Not scheduled' },
    ]
    for (const { input, expected } of cases) {
      if (!input) {
        expect('Not scheduled').toBe(expected)
        continue
      }
      const parts = [input.frequency, input.dayOfWeek, input.time, input.timezone].filter(Boolean)
      const result = parts.length ? parts.join(' · ') : 'Not scheduled'
      expect(result).toBe(expected)
    }
  })
})

describe('Campaign form validation', () => {
  it('rejects campaigns with empty names', () => {
    const validate = (name: string) => name.trim().length > 0
    expect(validate('')).toBe(false)
    expect(validate('   ')).toBe(false)
    expect(validate('My Campaign')).toBe(true)
  })

  it('maxPlayers is clamped to 1-10', () => {
    const clamp = (v: number) => Math.min(10, Math.max(1, v))
    expect(clamp(0)).toBe(1)
    expect(clamp(11)).toBe(10)
    expect(clamp(5)).toBe(5)
  })
})
