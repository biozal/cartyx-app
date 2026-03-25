import type { RecentlyUpdatedItem } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

const RECENTLY_UPDATED_ITEMS: RecentlyUpdatedItem[] = [
  {
    id: 'wiki-thornhollow-catacombs',
    title: 'Thornhollow Catacombs',
    type: 'Location',
    updatedAt: '2026-03-24T21:14:00Z',
    summary: 'Added the ossuary map, sealed crypt entrances, and the bell-keeper shortcut.',
  },
  {
    id: 'npc-councillor-veth',
    title: 'Councillor Veth',
    type: 'NPC',
    updatedAt: '2026-03-24T18:42:00Z',
    summary: 'Expanded suspected ties to the Ashen Compact and updated last-known sightings.',
  },
  {
    id: 'quest-shattered-vault',
    title: 'The Shattered Vault',
    type: 'Quest',
    updatedAt: '2026-03-23T23:05:00Z',
    summary: 'Tracked the three-lock vault puzzle and marked the unresolved voice-seal phrase.',
  },
  {
    id: 'lore-old-vareth',
    title: 'Old Vareth Phrases',
    type: 'Lore',
    updatedAt: '2026-03-23T16:27:00Z',
    summary: 'Cataloged funeral rites, warding refrains, and the phrase tied to moon-bells.',
  },
  {
    id: 'faction-ashen-compact',
    title: 'Ashen Compact',
    type: 'Faction',
    updatedAt: '2026-03-22T20:10:00Z',
    summary: 'Documented new cell symbols, messenger routes, and suspected allies in Thornhollow.',
  },
]

export interface RecentlyUpdatedService {
  getRecentlyUpdatedItems: () => Promise<RecentlyUpdatedItem[]>
}

export const mockRecentlyUpdatedService: RecentlyUpdatedService = {
  async getRecentlyUpdatedItems() {
    return resolveMockData(RECENTLY_UPDATED_ITEMS)
  },
}

export async function getRecentlyUpdatedItems(): Promise<RecentlyUpdatedItem[]> {
  return mockRecentlyUpdatedService.getRecentlyUpdatedItems()
}

export type { RecentlyUpdatedItem }
