import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenNameDialog } from '~/components/mainview/gmscreens/ScreenNameDialog'

describe('ScreenNameDialog', () => {
  const defaultProps = {
    title: 'New Screen',
    initialName: '',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  }

  it('auto-focuses the input on mount', () => {
    render(<ScreenNameDialog {...defaultProps} />)

    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('calls onSubmit with trimmed name on form submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScreenNameDialog {...defaultProps} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), '  My Screen  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith('My Screen')
  })

  it('does not submit when name is empty/whitespace', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ScreenNameDialog {...defaultProps} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), '   ')
    const submitBtn = screen.getByRole('button', { name: 'Create' })
    expect(submitBtn).toBeDisabled()
  })

  it('shows Save button when editing (initialName is set)', () => {
    render(<ScreenNameDialog {...defaultProps} title="Rename Screen" initialName="Old Name" />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ScreenNameDialog {...defaultProps} onCancel={onCancel} />)

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('displays error message when provided', () => {
    render(<ScreenNameDialog {...defaultProps} error="Name already taken" />)

    expect(screen.getByText('Name already taken')).toBeInTheDocument()
  })

  it('traps focus within the dialog', async () => {
    const user = userEvent.setup()
    render(<ScreenNameDialog {...defaultProps} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveFocus()

    // Tab through: input -> close button -> cancel -> create -> wraps back
    // The exact order depends on DOM order, but it should cycle
    const focusableElements = screen.getByRole('dialog').querySelectorAll(
      'button:not([disabled]), input:not([disabled])',
    )
    expect(focusableElements.length).toBeGreaterThanOrEqual(3)

    // Tab past the last element should wrap to first
    for (let i = 0; i < focusableElements.length; i++) {
      await user.tab()
    }
    expect(input).toHaveFocus()
  })

  it('has dialog role with aria-modal', () => {
    render(<ScreenNameDialog {...defaultProps} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'New Screen')
  })

  it('associates the label with the input via htmlFor/id', () => {
    render(<ScreenNameDialog {...defaultProps} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('id', 'screen-name-input')
    expect(screen.getByText('Name').closest('label')).toHaveAttribute('for', 'screen-name-input')
  })

  it('prevents double-submission when onSubmit is async', async () => {
    const user = userEvent.setup()
    let resolveSubmit!: () => void
    const onSubmit = vi.fn().mockImplementation(
      () => new Promise<void>(resolve => { resolveSubmit = resolve }),
    )
    render(<ScreenNameDialog {...defaultProps} onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox'), 'Test')

    // Submit twice rapidly via Enter
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Resolve the pending submission
    resolveSubmit()
  })
})
