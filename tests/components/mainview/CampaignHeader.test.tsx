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

const mockLogout = vi.fn()
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
    logout: mockLogout,
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
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toBeInTheDocument()
  })

  it('marks dashboard tab as active when activeTab is dashboard', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'false')
  })

  it('marks tabletop tab as active when activeTab is tabletop', () => {
    render(
      <CampaignHeader activeTab="tabletop" onTabChange={vi.fn()} />
    )
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'false')
  })

  it('only active tab is tabbable (roving tabindex)', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('tabindex', '-1')
  })

  it('calls onTabChange with correct tab when tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={onTabChange} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Tabletop' }))
    expect(onTabChange).toHaveBeenCalledWith('tabletop')
  })

  it('calls onTabChange with dashboard when dashboard tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <CampaignHeader activeTab="tabletop" onTabChange={onTabChange} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }))
    expect(onTabChange).toHaveBeenCalledWith('dashboard')
  })

  it('arrow keys navigate between tabs', () => {
    const onTabChange = vi.fn()
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={onTabChange} />
    )
    const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' })
    fireEvent.keyDown(dashboardTab, { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('tabletop')
  })

  it('displays session number when provided', () => {
    render(
      <CampaignHeader sessionNumber={66} activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.getByTestId('session-number')).toHaveTextContent('Session 66')
  })

  it('does not display session number when not provided', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.queryByTestId('session-number')).not.toBeInTheDocument()
  })

  it('renders the static Cartyx product name instead of a back link', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    expect(screen.getByText('Cartyx')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to campaigns' })).not.toBeInTheDocument()
  })

  it('opens and closes user menu', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    const menuButton = screen.getByRole('button', { name: /User menu for/ })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Close Campaign')).toBeInTheDocument()
    expect(screen.getByText('User Profile information')).toBeInTheDocument()
    expect(screen.getByText('Sign Out')).toBeInTheDocument()

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('calls logout when sign out is clicked', () => {
    render(
      <CampaignHeader activeTab="dashboard" onTabChange={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /User menu for/ }))
    fireEvent.click(screen.getByText('Sign Out'))
    expect(mockLogout).toHaveBeenCalled()
  })
})
