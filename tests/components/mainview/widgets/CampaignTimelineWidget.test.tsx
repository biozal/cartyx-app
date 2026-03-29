import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CampaignTimelineWidget } from '~/components/mainview/widgets/CampaignTimelineWidget'
import type { TimelineEvent } from '~/services/mocks/types'
import { getTimelineEvents } from '~/services/mocks/timelineService'

const mockEvents: ReadonlyArray<Readonly<TimelineEvent>> = [
  {
    id: 'timeline-3',
    calendarDate: '2nd of Frostmark, Year 3',
    sessionName: 'The Bell Beneath the Chapel',
    summary: 'A reliquary opened beneath the chapel after the second toll.',
    isCurrent: true,
  },
  {
    id: 'timeline-2',
    calendarDate: '14th of Ashfall, Year 3',
    sessionName: 'Ashes at Emberfall',
    summary: 'The party sealed the kiln gate and bound the cinder spirit.',
    importance: 'major',
  },
  {
    id: 'timeline-1',
    calendarDate: '27th of Hearthwane, Year 2',
    sessionName: 'Smoke Over Glassmere',
    summary: 'Raiders from the reed marsh torched the market while the wizard tracked a stolen wardstone.',
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
      expect(screen.getAllByText(event.calendarDate)).toHaveLength(2)
      expect(screen.getAllByText(event.sessionName)).toHaveLength(2)
    }
  })

  it('renders current and major emphasis states', () => {
    const { container } = render(<CampaignTimelineWidget events={mockEvents} />)
    const currentSummary = 'A reliquary opened beneath the chapel after the second toll.'
    const majorSummary = 'The party sealed the kiln gate and bound the cinder spirit.'

    expect(screen.getAllByText('CURRENT SESSION')).toHaveLength(2)
    expect(screen.getAllByText('MAJOR EVENT')).toHaveLength(2)
    expect(screen.getAllByTitle(currentSummary)).toHaveLength(2)
    expect(screen.getAllByTitle(majorSummary)).toHaveLength(2)

    expect(container.querySelector('[data-tone="current"]')).toBeInTheDocument()
    expect(container.querySelector('[data-tone="major"]')).toBeInTheDocument()
  })

  it('shows the empty state when there are no events', () => {
    render(<CampaignTimelineWidget events={[]} />)

    expect(screen.getByText('No timeline events')).toBeInTheDocument()
  })

  it('renders a horizontal scrollable container', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    const scroll = screen.getByTestId('timeline-scroll')
    const verticalTimeline = screen.getByTestId('timeline-vertical')
    expect(scroll).toHaveClass('overflow-x-auto')
    expect(scroll).toHaveClass('overflow-y-hidden')
    expect(scroll).toHaveClass('md:block')
    expect(scroll).toHaveAttribute('tabindex', '0')
    expect(scroll).toHaveAttribute(
      'aria-label',
      'Campaign timeline, horizontally scrollable events',
    )
    expect(verticalTimeline).toHaveClass('md:hidden')

    expect(scroll.querySelector('ol')).toHaveClass('grid-flow-col')
    expect(scroll.querySelector('[data-layout="horizontal"][data-tone="current"]')).toHaveTextContent(
      'A reliquary opened beneath the chapel after the second toll.',
    )
    expect(scroll.querySelector('[data-part="timeline-rail"]')).toBeInTheDocument()
    expect(scroll.querySelectorAll('[data-layout="horizontal"] [data-part="timeline-marker"]')).toHaveLength(
      mockEvents.length,
    )
  })

  it('renders a dedicated vertical mobile timeline', () => {
    render(<CampaignTimelineWidget events={mockEvents} />)

    const verticalTimeline = screen.getByTestId('timeline-vertical')
    expect(verticalTimeline).toHaveClass('flex-col')
    expect(verticalTimeline.querySelectorAll('[data-layout="vertical"]')).toHaveLength(
      mockEvents.length,
    )
    expect(verticalTimeline.querySelector('[data-tone="major"]')).toHaveTextContent(
      'The party sealed the kiln gate and bound the cinder spirit.',
    )
  })

  it('mock service returns defensive copies (new array and new objects)', async () => {
    const a = await getTimelineEvents()
    const b = await getTimelineEvents()
    expect(a).not.toBe(b)
    expect(a[0]).not.toBe(b[0])
    a[0].sessionName = 'MUTATED'
    expect((await getTimelineEvents())[0].sessionName).not.toBe('MUTATED')
  })
})
