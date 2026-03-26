import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WikiPanel } from '~/components/mainview/WikiPanel'

const CATEGORY_NAMES = [
  'Characters',
  'Locations',
  'Organizations',
  'Lore',
  'Creatures',
  'Races',
  'Calendar',
  'Events',
  'Notes',
  'Quests',
  'Objects',
  'Art Gallery',
]

describe('WikiPanel', () => {
  it('renders all 12 category buttons', () => {
    render(<WikiPanel />)

    expect(screen.getAllByRole('button')).toHaveLength(12)

    CATEGORY_NAMES.forEach((category) => {
      expect(screen.getByRole('button', { name: category })).toBeInTheDocument()
    })
  })

  it('clicking a category shows Coming Soon content', async () => {
    const user = userEvent.setup()
    render(<WikiPanel />)

    await user.click(screen.getByRole('button', { name: 'Characters' }))

    expect(screen.getByText('Characters - Coming Soon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('Back button returns to category list', async () => {
    const user = userEvent.setup()
    render(<WikiPanel />)

    await user.click(screen.getByRole('button', { name: 'Characters' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.queryByText('Characters - Coming Soon')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(12)
  })

  it('highlights the selected category', async () => {
    const user = userEvent.setup()
    render(<WikiPanel />)

    const charactersButton = screen.getByRole('button', { name: 'Characters' })
    await user.click(charactersButton)

    expect(charactersButton).toHaveAttribute('aria-pressed', 'true')
    expect(charactersButton).toHaveClass('bg-white/[0.05]')
  })
})
