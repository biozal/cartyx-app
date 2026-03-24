import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WidgetSlot } from '~/components/mainview/WidgetSlot'

describe('WidgetSlot', () => {
  it('renders the title', () => {
    render(
      <WidgetSlot title="Encounter Clock">
        <div>Clock details</div>
      </WidgetSlot>
    )

    expect(screen.getByText('Encounter Clock')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <WidgetSlot title="Party Status">
        <div>All members present</div>
      </WidgetSlot>
    )

    expect(screen.getByText('All members present')).toBeInTheDocument()
  })

  it('applies the provided className', () => {
    const { container } = render(
      <WidgetSlot title="Inventory" className="ring-1">
        <div>Supplies</div>
      </WidgetSlot>
    )

    expect(container.firstChild).toHaveClass('ring-1')
  })
})
