import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionModal } from '~/components/sessions/SessionModal'
import type { CampaignData } from '~/types/campaign'

type SessionData = CampaignData['sessions'][number]

const mockSession: SessionData = {
  id: 'session-1',
  number: 1,
  name: 'The Beginning',
  startDate: '2026-01-15',
  endDate: '2026-01-16',
  status: 'active' as const,
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  isLoading: false,
}

function renderModal(overrides: Partial<React.ComponentProps<typeof SessionModal>> = {}) {
  const props = { ...defaultProps, ...overrides }
  const result = render(<SessionModal {...props} />)
  return { ...result, props }
}

describe('SessionModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    defaultProps.onClose = vi.fn()
    defaultProps.onSubmit = vi.fn().mockResolvedValue(true)
  })

  // ── Create mode ─────────────────────────────────────────

  it('renders create form when no session provided', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Create Session' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Start Date')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  // ── Edit mode ───────────────────────────────────────────

  it('renders edit form when session provided', () => {
    renderModal({ session: mockSession })
    expect(screen.getByRole('heading', { name: 'Edit Session' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('The Beginning')
    expect(screen.getByLabelText('Start Date')).toHaveValue('2026-01-15')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  // ── End Date field visibility ───────────────────────────

  it('shows End Date field only in edit mode', () => {
    const { unmount } = render(<SessionModal {...defaultProps} />)
    expect(screen.queryByLabelText('End Date')).not.toBeInTheDocument()
    unmount()

    render(<SessionModal {...defaultProps} session={mockSession} />)
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })

  // ── Validation ──────────────────────────────────────────

  it('validates required fields on submit', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
      expect(screen.getByText('Start Date is required')).toBeInTheDocument()
    })
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  // ── Successful submit ──────────────────────────────────

  it('calls onSubmit with form data and closes on success', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    await user.type(screen.getByLabelText('Name'), 'Session One')
    await user.type(screen.getByLabelText('Start Date'), '2026-03-01')

    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith({
        name: 'Session One',
        startDate: '2026-03-01',
      })
    })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows error message when onSubmit returns false', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()
    vi.mocked(props.onSubmit).mockResolvedValue(false)

    await user.type(screen.getByLabelText('Name'), 'Session One')
    await user.type(screen.getByLabelText('Start Date'), '2026-03-01')

    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to save session. Please try again.')).toBeInTheDocument()
    })
    expect(props.onClose).not.toHaveBeenCalled()
  })

  // ── isOpen false ────────────────────────────────────────

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ── Backdrop click ──────────────────────────────────────

  it('closes when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    const backdrop = screen.getByRole('dialog')
    await user.click(backdrop)

    expect(props.onClose).toHaveBeenCalled()
  })

  // ── Loading state ───────────────────────────────────────

  it('shows Saving... on submit button while isLoading', () => {
    renderModal({ isLoading: true })
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument()
  })

  // ── Edit mode submits with endDate ──────────────────────

  it('submits endDate in edit mode', async () => {
    const user = userEvent.setup()
    const { props } = renderModal({ session: mockSession })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith({
        name: 'The Beginning',
        startDate: '2026-01-15',
        endDate: '2026-01-16',
      })
    })
    expect(props.onClose).toHaveBeenCalled()
  })

  // ── Close button ────────────────────────────────────────

  it('closes when X button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderModal()

    await user.click(screen.getByLabelText('Close modal'))
    expect(props.onClose).toHaveBeenCalled()
  })
})
