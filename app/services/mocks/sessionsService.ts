export interface Session {
  id: string
  number: number
  name: string
  summary: string
  date: string
}

const sessions: Session[] = [
  {
    id: 'session-14',
    number: 14,
    name: 'Ashes at Emberfall',
    summary: 'The party sealed the kiln gate and uncovered a traitor in the watch.',
    date: '2026-03-21',
  },
  {
    id: 'session-13',
    number: 13,
    name: 'The Bell Beneath the Chapel',
    summary: 'A buried sanctum opened beneath Emberfall Chapel after the second toll.',
    date: '2026-03-14',
  },
  {
    id: 'session-12',
    number: 12,
    name: 'Smoke Over Glassmere',
    summary: 'Raiders struck the lakeside market while the wizard tracked the stolen seal.',
    date: '2026-03-07',
  },
  {
    id: 'session-11',
    number: 11,
    name: 'A Crown of Hollow Iron',
    summary: 'Negotiations with the barrow knights turned when the false heir drew steel.',
    date: '2026-02-28',
  },
  {
    id: 'session-10',
    number: 10,
    name: 'The Silent Lantern',
    summary: 'An abandoned lighthouse answered with coded flashes from the northern shoals.',
    date: '2026-02-21',
  },
  {
    id: 'session-9',
    number: 9,
    name: 'Blackwater Oaths',
    summary: 'The ranger brokered passage through the marsh by honoring a forgotten pact.',
    date: '2026-02-14',
  },
  {
    id: 'session-8',
    number: 8,
    name: 'Teeth in the Snow',
    summary: 'A white drake stalked the caravan road and forced a midnight ambush.',
    date: '2026-02-07',
  },
  {
    id: 'session-7',
    number: 7,
    name: 'The Cartographer\'s Debt',
    summary: 'An old map led the party into a collapsed vault beneath the crossroads inn.',
    date: '2026-01-31',
  },
]

export function getSessions(): Session[] {
  return [...sessions]
}
