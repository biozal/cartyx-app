export interface TimelineEvent {
  id: string
  inGameDate: string
  sessionName: string
  summary: string
}

// Ordered most-recent first (newest at top of timeline)
const timelineEvents: TimelineEvent[] = [
  {
    id: 'timeline-2',
    inGameDate: '2nd of Frostmark, Year 3',
    sessionName: 'The Bell Beneath the Chapel',
    summary: 'A hidden reliquary opened under Emberfall Chapel when the black bell tolled at dawn.',
  },
  {
    id: 'timeline-1',
    inGameDate: '14th of Ashfall, Year 3',
    sessionName: 'Ashes at Emberfall',
    summary: 'The party sealed the kiln gate and bound the cinder spirit beneath the forge district.',
  },
  {
    id: 'timeline-3',
    inGameDate: '27th of Hearthwane, Year 2',
    sessionName: 'Smoke Over Glassmere',
    summary: 'Raiders from the reed marsh torched the market while the wizard tracked a stolen wardstone.',
  },
  {
    id: 'timeline-4',
    inGameDate: '11th of Longshade, Year 2',
    sessionName: 'A Crown of Hollow Iron',
    summary: 'Parley with the barrow knights collapsed when the false heir claimed the iron circlet.',
  },
  {
    id: 'timeline-5',
    inGameDate: '23rd of Dawnsreach, Year 2',
    sessionName: 'The Silent Lantern',
    summary: 'Signals from an abandoned lighthouse revealed a smuggler route through the northern shoals.',
  },
  {
    id: 'timeline-6',
    inGameDate: '8th of Mistmere, Year 2',
    sessionName: 'Blackwater Oaths',
    summary: 'The ranger renewed an old marsh pact and earned safe passage through the drowned ruins.',
  },
]

export function getTimelineEvents(): TimelineEvent[] {
  return timelineEvents.map((event) => ({ ...event }))
}
