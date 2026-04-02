import type { CampaignData } from '~/server/functions/campaigns'
import { resolveMockData } from '~/services/mocks/utils'

type Session = CampaignData['sessions'][number]

export const mockSessions: ReadonlyArray<Readonly<Session>> = Object.freeze([
  Object.freeze({
    id: 'session-14',
    number: 14,
    name: 'Ashes at Emberfall',
    startDate: '2026-03-21T00:00:00.000Z',
    endDate: null,
    status: 'active' as const,
  }),
  Object.freeze({
    id: 'session-13',
    number: 13,
    name: 'The Bell Beneath the Chapel',
    startDate: '2026-03-14T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-12',
    number: 12,
    name: 'Smoke Over Glassmere',
    startDate: '2026-03-07T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-11',
    number: 11,
    name: 'A Crown of Hollow Iron',
    startDate: '2026-02-28T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-10',
    number: 10,
    name: 'The Silent Lantern',
    startDate: '2026-02-21T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-9',
    number: 9,
    name: 'Blackwater Oaths',
    startDate: '2026-02-14T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-8',
    number: 8,
    name: 'Teeth in the Snow',
    startDate: '2026-02-07T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
  Object.freeze({
    id: 'session-7',
    number: 7,
    name: 'The Cartographer\'s Debt',
    startDate: '2026-01-31T00:00:00.000Z',
    endDate: null,
    status: 'not_started' as const,
  }),
])

export interface SessionsService {
  getSessions: () => Promise<Session[]>
}

export const mockSessionsService: SessionsService = {
  async getSessions() {
    return resolveMockData(mockSessions.map((session) => ({ ...session })))
  },
}

export async function getSessions(): Promise<Session[]> {
  return mockSessionsService.getSessions()
}

export type { Session }
