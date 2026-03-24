import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('double-clicking the header toggles minimized state', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Party Status">
        <div>All members present</div>
      </Widget>
    )

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

  it('fullscreen button opens modal', async () => {
    const user = userEvent.setup()

    render(
      <Widget title="Map">
        <div>Expanded view</div>
      </Widget>
    )

    await user.click(screen.getByRole('button', { name: 'Open Map in fullscreen' }))

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

    expect(screen.queryByRole('button', { name: 'Close Map fullscreen' })).not.toBeInTheDocument()
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
