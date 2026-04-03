import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '~/components/mainview/gmscreens/ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    title: 'Delete Screen',
    message: 'Are you sure?',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('auto-focuses the cancel button on mount', () => {
    render(<ConfirmDialog {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('traps focus within the dialog', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog {...defaultProps} />)

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    const confirmBtn = screen.getByRole('button', { name: 'Delete' })

    expect(cancelBtn).toHaveFocus()

    // Tab from cancel to confirm
    await user.tab()
    expect(confirmBtn).toHaveFocus()

    // Tab from confirm wraps back to cancel
    await user.tab()
    expect(cancelBtn).toHaveFocus()
  })

  it('has alertdialog role and aria-modal', () => {
    render(<ConfirmDialog {...defaultProps} />)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Delete Screen')
  })

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
