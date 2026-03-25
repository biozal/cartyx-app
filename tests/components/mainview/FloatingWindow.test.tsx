import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FloatingWindow } from '~/components/mainview/FloatingWindow'

describe('FloatingWindow', () => {
  it('renders title and children', () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="notes" title="DM Notes">
          <div>Archive key hidden in the altar.</div>
        </FloatingWindow>
      </div>,
    )

    expect(screen.getByText('DM Notes')).toBeInTheDocument()
    expect(screen.getByText('Archive key hidden in the altar.')).toBeInTheDocument()
  })

  it('close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="notes" title="DM Notes" onClose={onClose}>
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Close DM Notes' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('minimize button calls onStateChange with minimized', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="map" title="Map" onStateChange={onStateChange}>
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Minimize Map' }))

    expect(onStateChange).toHaveBeenCalledWith('minimized')
  })

  it('maximize button calls onStateChange with maximized', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="map" title="Map" onStateChange={onStateChange}>
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Maximize Map' }))

    expect(onStateChange).toHaveBeenCalledWith('maximized')
  })

  it('maximized window shows restore button', () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="sheet" title="Character Sheet" initialState="maximized">
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    expect(screen.getByRole('button', { name: 'Restore Character Sheet' })).toBeInTheDocument()
  })

  it('clicking restore calls onStateChange with normal', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow
          id="sheet"
          title="Character Sheet"
          initialState="maximized"
          onStateChange={onStateChange}
        >
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Restore Character Sheet' }))

    expect(onStateChange).toHaveBeenCalledWith('normal')
  })

  it('has the correct dialog accessibility attributes', () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow id="wiki" title="Wiki Entry">
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Wiki Entry' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Wiki Entry')
    expect(dialog).toHaveAttribute('aria-labelledby')
  })
})
