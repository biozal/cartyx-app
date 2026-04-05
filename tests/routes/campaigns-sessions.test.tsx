import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// --- Hook mocks ---
const mockUseSessions = vi.fn()
const mockUseCreateSession = vi.fn()
const mockUseUpdateSession = vi.fn()
const mockUseActivateSession = vi.fn()
const mockUseCampaign = vi.fn()

vi.mock('~/hooks/useSessions', () => ({
  useSessions: (...args: unknown[]) => mockUseSessions(...args),
  useCreateSession: () => mockUseCreateSession(),
  useUpdateSession: () => mockUseUpdateSession(),
  useActivateSession: () => mockUseActivateSession(),
}))

vi.mock('~/hooks/useCampaigns', () => ({
  useCampaign: (...args: unknown[]) => mockUseCampaign(...args),
}))

// --- Router mock ---
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    [key: string]: unknown
  }) => {
    let href = to
    if (params?.campaignId) href = href.replace('$campaignId', params.campaignId)
    if (search) href += '?' + new URLSearchParams(search).toString()
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
  useParams: () => ({ campaignId: 'c1' }),
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ campaignId: 'c1' }),
  }),
  redirect: vi.fn(),
}))

// --- Component mocks ---
vi.mock('~/components/sessions/SessionModal', () => ({
  SessionModal: ({ isOpen, session }: { isOpen: boolean; session?: unknown }) =>
    isOpen ? (
      <div data-testid="session-modal">{session ? 'edit' : 'create'}</div>
    ) : null,
}))

vi.mock('~/components/PixelButton', () => ({
  PixelButton: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ _icon }: { _icon: unknown }) => <span data-testid="fa-icon" />,
}))

vi.mock('@fortawesome/pro-solid-svg-icons', () => ({
  faArrowLeft: 'faArrowLeft',
  faPlus: 'faPlus',
}))

vi.mock('~/server/functions/auth', () => ({ getMe: vi.fn() }))

import { SessionsPage } from '~/routes/campaigns/$campaignId/sessions'

const baseSessions = [
  {
    id: 's1',
    name: 'The Dark Descent',
    number: 1,
    startDate: '2026-03-01T00:00:00.000Z',
    endDate: null,
    status: 'active' as const,
  },
  {
    id: 's2',
    name: 'Into the Abyss',
    number: 2,
    startDate: '2026-03-08T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  },
  {
    id: 's3',
    name: 'The Return',
    number: 3,
    startDate: '2026-02-01T00:00:00.000Z',
    endDate: '2026-02-28T00:00:00.000Z',
    status: 'completed' as const,
  },
]

function setupMocks(
  sessions = baseSessions,
  overrides?: { isOwner?: boolean },
) {
  mockUseSessions.mockReturnValue({
    sessions,
    isLoading: false,
    error: null,
  })
  mockUseCreateSession.mockReturnValue({
    create: vi.fn(),
    isLoading: false,
    error: null,
  })
  mockUseUpdateSession.mockReturnValue({
    update: vi.fn(),
    isLoading: false,
    error: null,
  })
  mockUseActivateSession.mockReturnValue({
    activate: vi.fn(),
    isLoading: false,
    error: null,
  })
  mockUseCampaign.mockReturnValue({
    campaign: { isOwner: overrides?.isOwner ?? true },
    isLoading: false,
    error: null,
  })
}

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders session list', () => {
    render(<SessionsPage />)
    expect(screen.getByText('The Dark Descent')).toBeInTheDocument()
    expect(screen.getByText('Into the Abyss')).toBeInTheDocument()
    expect(screen.getByText('The Return')).toBeInTheDocument()
  })

  it('highlights the active session with border-l-[#2563EB] class', () => {
    render(<SessionsPage />)
    const activeCard = screen.getByText('The Dark Descent').closest('[data-testid="session-card-s1"]')
    expect(activeCard).toHaveClass('border-l-[#2563EB]')
  })

  it('shows Activate button only on non-active incomplete sessions', () => {
    render(<SessionsPage />)
    // Active session should NOT have Activate button
    const activeCard = screen.getByTestId('session-card-s1')
    expect(activeCard.querySelector('[data-testid="activate-btn-s1"]')).not.toBeInTheDocument()

    // Non-active incomplete session SHOULD have Activate button
    expect(screen.getByTestId('activate-btn-s2')).toBeInTheDocument()

    // Completed session should NOT have Activate button
    expect(screen.queryByTestId('activate-btn-s3')).not.toBeInTheDocument()
  })

  it('shows empty state when no sessions exist', () => {
    setupMocks([])
    render(<SessionsPage />)
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
  })

  it('opens create modal when "New Session" clicked', () => {
    render(<SessionsPage />)
    expect(screen.queryByTestId('session-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('New Session'))
    expect(screen.getByTestId('session-modal')).toBeInTheDocument()
    expect(screen.getByTestId('session-modal')).toHaveTextContent('create')
  })

  it('shows back link to play page', () => {
    render(<SessionsPage />)
    const backLink = screen.getByRole('link', { name: /back/i })
      || document.querySelector('a[href*="play"]')
    expect(backLink).toBeInTheDocument()
    expect(backLink).toHaveAttribute(
      'href',
      expect.stringContaining('/campaigns/c1/play'),
    )
  })
})
