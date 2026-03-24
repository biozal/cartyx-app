import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Widget } from '~/components/mainview/Widget'

describe('Widget', () => {
  it('renders title and children', () => {
    render(
      <Widget title="Encounter Clock">
        <div>Clock details</div>
      </Widget>
    )

    expect(screen.getByText('Encounter Clock')).toBeInTheDocument()
    expect(screen.getByText('Clock details')).toBeInTheDocument()
  })

  it('double-clicking the title area toggles minimized state', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Party Status">
        <div>All members present</div>
      </Widget>
    )

    // Double-click the title text area
    await user.dblClick(screen.getByText('Party Status'))
    expect(screen.queryByText('All members present')).not.toBeInTheDocument()

    await user.dblClick(screen.getByText('Party Status'))
    expect(screen.getByText('All members present')).toBeInTheDocument()
  })

  it('minimized state hides content', () => {
    render(
      <Widget title="Inventory" defaultMinimized>
        <div>Supplies</div>
      </Widget>
    )

    expect(screen.queryByText('Supplies')).not.toBeInTheDocument()
  })

  it('explicit minimize button toggles minimized state', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Map content</div>
      </Widget>
    )

    const minimizeBtn = screen.getByRole('button', { name: 'Minimize Map' })
    await user.click(minimizeBtn)
    expect(screen.queryByText('Map content')).not.toBeInTheDocument()

    const expandBtn = screen.getByRole('button', { name: 'Expand Map' })
    await user.click(expandBtn)
    expect(screen.getByText('Map content')).toBeInTheDocument()
  })

  it('fullscreen button opens modal with dialog role', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Expanded view</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Map in fullscreen' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close Map fullscreen' })).toBeInTheDocument()
  })

  it('modal close button closes modal', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Expanded view</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Map in fullscreen' }))
    await user.click(screen.getByRole('button', { name: 'Close Map fullscreen' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape key closes fullscreen modal', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Expanded view</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Map in fullscreen' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('backdrop click closes fullscreen modal', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Expanded view</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Map in fullscreen' }))
    const backdrop = screen.getByRole('dialog')
    // Click the backdrop (outer overlay), not the inner content
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('content is not duplicated when fullscreen is open', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Stats">
        <div data-testid="widget-content">Unique content</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Stats in fullscreen' }))

    // Content should only appear once (in the modal, not in-card)
    expect(screen.getAllByTestId('widget-content')).toHaveLength(1)
  })

  it('double-clicking fullscreen button does not toggle minimize', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Map content</div>
      </Widget>
    )

    // Double-click the fullscreen button
    await user.dblClick(screen.getByRole('button', { name: 'Open Map in fullscreen' }))

    // Content should still be visible (not minimized)
    // Close the modal first
    await user.keyboard('{Escape}')
    expect(screen.getByText('Map content')).toBeInTheDocument()
  })

  it('applies the provided className', () => {
    const { container } = render(
      <Widget title="Inventory" className="ring-1">
        <div>Supplies</div>
      </Widget>
    )

    expect(container.firstChild).toHaveClass('ring-1')
  })
})
