import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    const scroll = screen.getByTestId('timeline-scroll')
    const verticalTimeline = screen.getByTestId('timeline-vertical')

    for (const event of mockEvents) {
      expect(within(scroll).getByText(event.calendarDate)).toBeInTheDocument()
      expect(within(verticalTimeline).getByText(event.calendarDate)).toBeInTheDocument()
      expect(within(scroll).getByText(event.sessionName)).toBeInTheDocument()
      expect(within(verticalTimeline).getByText(event.sessionName)).toBeInTheDocument()
    }
  })

  it('renders current and major emphasis states', () => {
    const { container } = render(<CampaignTimelineWidget events={mockEvents} />)
    const currentSummary = 'A reliquary opened beneath the chapel after the second toll.'
    const majorSummary = 'The party sealed the kiln gate and bound the cinder spirit.'
    const scroll = screen.getByTestId('timeline-scroll')
    const verticalTimeline = screen.getByTestId('timeline-vertical')

    expect(within(scroll).getByText('CURRENT SESSION')).toBeInTheDocument()
    expect(within(verticalTimeline).getByText('CURRENT SESSION')).toBeInTheDocument()
    expect(within(scroll).getByText('MAJOR EVENT')).toBeInTheDocument()
    expect(within(verticalTimeline).getByText('MAJOR EVENT')).toBeInTheDocument()
    expect(within(scroll).getByTitle(currentSummary)).toBeInTheDocument()
    expect(within(verticalTimeline).getByTitle(currentSummary)).toBeInTheDocument()
    expect(within(scroll).getByTitle(majorSummary)).toBeInTheDocument()
    expect(within(verticalTimeline).getByTitle(majorSummary)).toBeInTheDocument()

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
    expect(verticalTimeline).toHaveClass('md:hidden')
    expect(within(verticalTimeline).getByRole('list')).toHaveClass('flex-col')
    expect(verticalTimeline.querySelectorAll('[data-layout="vertical"]')).toHaveLength(
      mockEvents.length,
    )
    expect(verticalTimeline.querySelector('[data-tone="major"]')).toHaveTextContent(
      'The party sealed the kiln gate and bound the cinder spirit.',
    )
    expect(verticalTimeline.querySelector('[data-part="timeline-rail"]')).toBeInTheDocument()
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
