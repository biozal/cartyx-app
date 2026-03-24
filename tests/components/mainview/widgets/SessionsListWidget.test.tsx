import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionsListWidget } from '~/components/mainview/widgets/SessionsListWidget'

describe('SessionsListWidget', () => {
  it('renders the widget title', () => {
    render(<SessionsListWidget sessions={[]} />)

    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders all provided session names and numbers', () => {
    render(
      <SessionsListWidget
        sessions={[
          {
            id: 'session-14',
            number: 14,
            name: 'Ashes at Emberfall',
            summary: 'The party sealed the kiln gate.',
            date: '2026-03-21',
          },
          {
            id: 'session-13',
            number: 13,
            name: 'The Bell Beneath the Chapel',
            summary: 'A buried sanctum opened beneath the chapel.',
            date: '2026-03-14',
          },
        ]}
      />
    )

    expect(screen.getByText('Ashes at Emberfall')).toBeInTheDocument()
    expect(screen.getByText('The Bell Beneath the Chapel')).toBeInTheDocument()
    expect(screen.getByText('#14')).toBeInTheDocument()
    expect(screen.getByText('#13')).toBeInTheDocument()
  })

  it('shows the empty state when no sessions are provided', () => {
    render(<SessionsListWidget sessions={[]} />)

    expect(screen.getByText('No sessions recorded')).toBeInTheDocument()
  })
})
