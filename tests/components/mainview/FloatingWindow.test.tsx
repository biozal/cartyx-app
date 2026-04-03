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

    // Non-modal dialog — aria-modal removed per a11y guidance (content behind is interactive)
    expect(dialog).not.toHaveAttribute('aria-modal')
    // aria-label removed — aria-labelledby is sufficient (avoids redundant labeling)
    expect(dialog).not.toHaveAttribute('aria-label')
    expect(dialog).toHaveAttribute('aria-labelledby')
  })

  it('maximize then restore preserves original size and position', async () => {
    const user = userEvent.setup()
    const stateChanges: string[] = []

    render(
      <div className="relative h-[600px] w-[800px]">
        <FloatingWindow
          id="notes"
          title="Notes"
          initialPosition={{ x: 50, y: 75 }}
          initialSize={{ width: 300, height: 250 }}
          onStateChange={(s) => stateChanges.push(s)}
        >
          <div>Content</div>
        </FloatingWindow>
      </div>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Notes' })

    // Verify initial geometry
    expect(dialog.style.transform).toBe('translate(50px, 75px)')
    expect(dialog.style.width).toBe('300px')
    expect(dialog.style.height).toBe('250px')

    // Maximize
    await user.click(screen.getByRole('button', { name: 'Maximize Notes' }))
    expect(stateChanges).toContain('maximized')

    // Restore
    await user.click(screen.getByRole('button', { name: 'Restore Notes' }))
    expect(stateChanges).toContain('normal')

    // Geometry should be restored to original values
    expect(dialog.style.transform).toBe('translate(50px, 75px)')
    expect(dialog.style.width).toBe('300px')
    expect(dialog.style.height).toBe('250px')
  })
})
