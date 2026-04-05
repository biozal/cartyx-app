import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WikiPanel } from '~/components/wiki/WikiPanel'

// Mock CharactersPanel since it requires routing/campaign context
vi.mock('~/components/wiki/characters/CharactersPanel', () => ({
  CharactersPanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="characters-panel">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

describe('WikiPanel', () => {
  it('renders the Characters category button', () => {
    render(<WikiPanel />)

    expect(screen.getByRole('button', { name: 'Characters' })).toBeInTheDocument()
  })

  it('only shows Characters category (no other categories)', () => {
    render(<WikiPanel />)

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('clicking Characters shows CharactersPanel', async () => {
    const user = userEvent.setup()
    render(<WikiPanel />)

    await user.click(screen.getByRole('button', { name: 'Characters' }))

    expect(screen.getByTestId('characters-panel')).toBeInTheDocument()
  })

  it('CharactersPanel onBack returns to category list', async () => {
    const user = userEvent.setup()
    render(<WikiPanel />)

    await user.click(screen.getByRole('button', { name: 'Characters' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.queryByTestId('characters-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Characters' })).toBeInTheDocument()
  })
})
