import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseLoaderData } = vi.hoisted(() => ({
  mockUseLoaderData: vi.fn(),
}))

function resolveToHref(to: string, params?: Record<string, string>) {
  if (!params) return to
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`$${key}`, value),
    to,
  )
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={resolveToHref(to, params)} {...props}>{children}</a>
  ),
  createFileRoute: vi.fn(() => vi.fn(() => ({ useLoaderData: mockUseLoaderData }))),
  redirect: vi.fn(),
}))

vi.mock('~/components/Topbar', () => ({ Topbar: () => <nav data-testid="topbar" /> }))
vi.mock('~/components/Toast', () => ({ Toast: () => null, showToast: vi.fn() }))
vi.mock('~/server/functions/auth', () => ({ getMe: vi.fn() }))
vi.mock('~/server/functions/campaigns', () => ({ getCampaign: vi.fn() }))
vi.mock('~/providers/QueryProvider', () => ({ getQueryClient: vi.fn() }))
vi.mock('~/utils/queryKeys', () => ({
  queryKeys: { campaigns: { detail: vi.fn() } },
}))

import { CampaignSummaryPage } from '~/routes/campaigns/$campaignId/summary'

describe('CampaignSummaryPage', () => {
  beforeEach(() => {
    mockUseLoaderData.mockReturnValue({
      campaign: {
        id: 'camp-1',
        name: 'The Lost Mines of Phandelver',
        description: 'A classic D&D adventure in the Forgotten Realms.',
        imagePath: null,
        inviteCode: 'ABCD-EFGH',
        links: [],
        maxPlayers: 4,
        scheduleText: 'Weekly · Friday · at 7:00 PM · CST',
        isOwner: true,
      },
    })
  })

  it('renders an Enter Campaign button to the play route', () => {
    render(<CampaignSummaryPage />)

    expect(screen.getByText('Enter Campaign').closest('a')).toHaveAttribute('href', '/campaigns/camp-1/play')
  })
})
