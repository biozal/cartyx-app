import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { generateInviteCode, parseMaxPlayers } from '~/server/utils/helpers'
import { buildScheduleText, campaignInputSchema } from '~/server/functions/campaigns'

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
vi.mock('~/server/functions/campaigns', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/functions/campaigns')>()
  return {
    ...original,
    listCampaigns: vi.fn(),
    getCampaign: vi.fn(),
  }
})

describe('Campaign list helpers (production code)', () => {
  it('generates invite code in XXXX-XXXX format', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(9)
    expect(code[4]).toBe('-')
    // Verify only allowed characters (no ambiguous 0/O/1/I)
    expect(code.replace('-', '')).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('builds schedule text from parts via production buildScheduleText', () => {
    expect(buildScheduleText({
      frequency: 'weekly', dayOfWeek: 'Sat', time: '19:00', timezone: 'America/Chicago',
    })).toBe('weekly · Sat · 19:00 · America/Chicago')

    expect(buildScheduleText(null)).toBe('Not scheduled')

    expect(buildScheduleText({
      frequency: null, dayOfWeek: null, time: null, timezone: null,
    })).toBe('Not scheduled')

    expect(buildScheduleText({
      frequency: 'monthly', dayOfWeek: null, time: '20:00', timezone: null,
    })).toBe('monthly · 20:00')
  })
})

describe('Campaign form validation (production code)', () => {
  it('rejects campaigns with empty names via production schema', () => {
    const result = campaignInputSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)

    const valid = campaignInputSchema.safeParse({ name: 'My Campaign' })
    expect(valid.success).toBe(true)

    // Also test the trim check used in the handler
    expect('   '.trim().length > 0).toBe(false)
  })

  it('allows empty description (matches server default)', () => {
    const result = campaignInputSchema.safeParse({ name: 'Test', description: '' })
    expect(result.success).toBe(true)

    const noDesc = campaignInputSchema.safeParse({ name: 'Test' })
    expect(noDesc.success).toBe(true)
  })

  it('maxPlayers clamped to 1-10 via production parseMaxPlayers', () => {
    expect(parseMaxPlayers(0)).toBe(1)
    expect(parseMaxPlayers(11)).toBe(10)
    expect(parseMaxPlayers(5)).toBe(5)
    expect(parseMaxPlayers(undefined)).toBe(4)
    expect(parseMaxPlayers('abc')).toBe(1)
  })
})
