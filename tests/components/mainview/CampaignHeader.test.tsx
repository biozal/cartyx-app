import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('~/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

import { CampaignHeader } from '~/components/mainview/CampaignHeader'
import { useAuth } from '~/hooks/useAuth'

const mockUser = {
  id: 'g_1',
  provider: 'google' as const,
  name: 'Alice',
  email: 'alice@example.com',
  avatar: null,
  role: 'gm' as const,
}

function defaultAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

describe('CampaignHeader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    defaultAuth()
  })

  it('renders both tabs', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toBeInTheDocument()
  })

  it('marks dashboard tab as active when activeTab is dashboard', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'false')
  })

  it('marks tabletop tab as active when activeTab is tabletop', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="tabletop"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onTabChange with correct tab when tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="dashboard"
        onTabChange={onTabChange}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Tabletop' }))
    expect(onTabChange).toHaveBeenCalledWith('tabletop')
  })

  it('calls onTabChange with dashboard when dashboard tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="tabletop"
        onTabChange={onTabChange}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }))
    expect(onTabChange).toHaveBeenCalledWith('dashboard')
  })

  it('displays session number when provided', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        sessionNumber={66}
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.getByTestId('session-number')).toHaveTextContent('Session 66')
  })

  it('does not display session number when not provided', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.queryByTestId('session-number')).not.toBeInTheDocument()
  })

  it('renders back link', () => {
    render(
      <CampaignHeader
        campaignId="abc"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    )
    expect(screen.getByRole('link', { name: 'Back to campaigns' })).toBeInTheDocument()
  })
})
