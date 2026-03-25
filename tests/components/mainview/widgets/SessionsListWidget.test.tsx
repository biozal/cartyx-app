import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionsListWidget } from '~/components/mainview/widgets/SessionsListWidget'
import { getSessions } from '~/services/mocks/sessionsService'

const mockSessions = [
  { id: 's1', number: 14, name: 'Ashes at Emberfall', summary: 'The party sealed the kiln gate.', date: '2026-03-21' },
  { id: 's2', number: 13, name: 'The Bell Beneath', summary: 'A buried sanctum opened.', date: '2026-03-14' },
]

describe('SessionsListWidget', () => {
  it('renders the widget title', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders all session names', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    expect(screen.getByText('Ashes at Emberfall')).toBeInTheDocument()
    expect(screen.getByText('The Bell Beneath')).toBeInTheDocument()
  })

  it('renders session numbers', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    expect(screen.getByText('#14')).toBeInTheDocument()
    expect(screen.getByText('#13')).toBeInTheDocument()
  })

  it('renders session summaries', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    expect(screen.getByText('The party sealed the kiln gate.')).toBeInTheDocument()
    expect(screen.getByText('A buried sanctum opened.')).toBeInTheDocument()
  })

  it('renders session dates', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    expect(screen.getByText('2026-03-21')).toBeInTheDocument()
    expect(screen.getByText('2026-03-14')).toBeInTheDocument()
  })

  it('renders scrollable container', () => {
    render(<SessionsListWidget sessions={mockSessions} />)
    const scroll = screen.getByTestId('sessions-scroll')
    expect(scroll).toHaveClass('max-h-[400px]')
    expect(scroll).toHaveClass('overflow-y-auto')
  })

  it('shows empty state when sessions is empty', () => {
    render(<SessionsListWidget sessions={[]} />)
    expect(screen.getByText('No sessions recorded')).toBeInTheDocument()
  })

  it('mock service returns a defensive copy', () => {
    const a = getSessions()
    const b = getSessions()
    expect(a).not.toBe(b)
  })
})
