import type { TimelineEvent } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

// Ordered most-recent first (newest at top of timeline)
export const mockTimelineEvents: ReadonlyArray<Readonly<TimelineEvent>> = Object.freeze([
  Object.freeze({
    id: 'timeline-2',
    calendarDate: '2nd of Frostmark, Year 3',
    sessionName: 'The Bell Beneath the Chapel',
    summary: 'A hidden reliquary opened under Emberfall Chapel when the black bell tolled at dawn.',
  }),
  Object.freeze({
    id: 'timeline-1',
    calendarDate: '14th of Ashfall, Year 3',
    sessionName: 'Ashes at Emberfall',
    summary: 'The party sealed the kiln gate and bound the cinder spirit beneath the forge district.',
  }),
  Object.freeze({
    id: 'timeline-3',
    calendarDate: '27th of Hearthwane, Year 2',
    sessionName: 'Smoke Over Glassmere',
    summary: 'Raiders from the reed marsh torched the market while the wizard tracked a stolen wardstone.',
  }),
  Object.freeze({
    id: 'timeline-4',
    calendarDate: '11th of Longshade, Year 2',
    sessionName: 'A Crown of Hollow Iron',
    summary: 'Parley with the barrow knights collapsed when the false heir claimed the iron circlet.',
  }),
  Object.freeze({
    id: 'timeline-5',
    calendarDate: '23rd of Dawnsreach, Year 2',
    sessionName: 'The Silent Lantern',
    summary: 'Signals from an abandoned lighthouse revealed a smuggler route through the northern shoals.',
  }),
  Object.freeze({
    id: 'timeline-6',
    calendarDate: '8th of Mistmere, Year 2',
    sessionName: 'Blackwater Oaths',
    summary: 'The ranger renewed an old marsh pact and earned safe passage through the drowned ruins.',
  }),
])

export interface TimelineService {
  getTimelineEvents: () => Promise<TimelineEvent[]>
}

export const mockTimelineService: TimelineService = {
  async getTimelineEvents() {
    return resolveMockData(mockTimelineEvents.map((event) => ({ ...event })))
  },
}

export async function getTimelineEvents(): Promise<TimelineEvent[]> {
  return mockTimelineService.getTimelineEvents()
}

export type { TimelineEvent }
