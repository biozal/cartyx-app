import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock dependencies
vi.mock('~/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

import { Topbar } from '~/components/Topbar'
import { useAuth } from '~/hooks/useAuth'

describe('Topbar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when user is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, isAuthenticated: false, isLoading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    const { container } = render(<Topbar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders CARTYX brand link when user is present', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'g_1', provider: 'google', name: 'Alice', email: 'alice@example.com', avatar: null, role: 'gm', accessToken: null, refreshToken: null, tokenIssuedAt: Date.now() },
      isAuthenticated: true, isLoading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<Topbar />)
    expect(screen.getByText('CARTYX')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows avatar image when user has avatar', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'g_1', provider: 'google', name: 'Bob', email: null, avatar: 'https://example.com/pic.jpg', role: 'player', accessToken: null, refreshToken: null, tokenIssuedAt: Date.now() },
      isAuthenticated: true, isLoading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<Topbar />)
    const img = screen.getByAltText('Bob avatar')
    expect(img).toHaveAttribute('src', 'https://example.com/pic.jpg')
  })

  it('shows emoji placeholder when user has no avatar', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'g_1', provider: 'google', name: 'Carol', email: null, avatar: null, role: 'gm', accessToken: null, refreshToken: null, tokenIssuedAt: Date.now() },
      isAuthenticated: true, isLoading: false,
      login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    })
    render(<Topbar />)
    expect(screen.getByText('🧙')).toBeInTheDocument()
  })

  it('toggles dropdown menu on button click', () => {
    const logoutMock = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'g_1', provider: 'google', name: 'Dave', email: null, avatar: null, role: 'gm', accessToken: null, refreshToken: null, tokenIssuedAt: Date.now() },
      isAuthenticated: true, isLoading: false,
      login: vi.fn(), logout: logoutMock, refresh: vi.fn(),
    })
    render(<Topbar />)

    // Menu not visible initially
    expect(screen.queryByText('🚪 Sign Out')).not.toBeInTheDocument()

    // Click to open
    fireEvent.click(screen.getByText('Dave'))
    expect(screen.getByText('🚪 Sign Out')).toBeInTheDocument()

    // Click sign out calls logout
    fireEvent.click(screen.getByText('🚪 Sign Out'))
    expect(logoutMock).toHaveBeenCalled()
  })
})
