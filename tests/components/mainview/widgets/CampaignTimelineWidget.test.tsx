import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignTimelineWidget } from '~/components/mainview/widgets/CampaignTimelineWidget'
import { getTimelineEvents } from '~/services/mocks/timelineService'

const mockEvents = [
  {
    id: 'timeline-1',
    inGameDate: '14th of Ashfall, Year 3',
    sessionName: 'Ashes at Emberfall',
    summary: 'The party sealed the kiln gate and bound the cinder spirit.',
  },
  {
    id: 'timeline-2',
    inGameDate: '2nd of Frostmark, Year 3',
    sessionName: 'The Bell Beneath the Chapel',
    summary: 'A reliquary opened beneath the chapel after the second toll.',
  },
]

describe('CampaignTimelineWidget', () => {
  it('renders the widget title', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    expect(screen.getByText('Campaign Timeline')).toBeInTheDocument()
  })

  it('renders all event dates and session names', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    for (const event of mockEvents) {
      expect(screen.getByText(event.inGameDate)).toBeInTheDocument()
      expect(screen.getByText(event.sessionName)).toBeInTheDocument()
    }
  })

  it('renders summaries', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    expect(
      screen.getByText('The party sealed the kiln gate and bound the cinder spirit.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('A reliquary opened beneath the chapel after the second toll.')
    ).toBeInTheDocument()
  })

  it('shows the empty state when there are no events', () => {
    render(<CampaignTimelineWidget events={[]} />)

    expect(screen.getByText('No timeline events')).toBeInTheDocument()
  })

  it('renders a scrollable container', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    const scroll = screen.getByTestId('timeline-scroll')
    expect(scroll).toHaveClass('max-h-[500px]')
    expect(scroll).toHaveClass('overflow-y-auto')
  })

  it('mock service returns defensive copies (new array and new objects)', () => {
    const a = getTimelineEvents()
    const b = getTimelineEvents()
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
    a[0].sessionName = 'MUTATED'
    expect(getTimelineEvents()[0].sessionName).not.toBe('MUTATED')
  })
})
