import type { PartyMember } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

const PARTY_MEMBERS: PartyMember[] = [
  {
    id: 'thorne-ironheart',
    name: 'Thorne Ironheart',
    characterClass: 'Paladin',
    race: 'Dwarf',
  },
  {
    id: 'mira-shadowleaf',
    name: 'Mira Shadowleaf',
    characterClass: 'Ranger',
    race: 'Wood Elf',
  },
  {
    id: 'kael-emberwake',
    name: 'Kael Emberwake',
    characterClass: 'Sorcerer',
    race: 'Tiefling',
  },
  {
    id: 'seraphina-duskwhisper',
    name: 'Seraphina Duskwhisper',
    characterClass: 'Cleric',
    race: 'Half-Elf',
  },
  {
    id: 'bram-tanglefoot',
    name: 'Bram Tanglefoot',
    characterClass: 'Rogue',
    race: 'Lightfoot Halfling',
  },
]

export interface PartyMembersService {
  getPartyMembers: () => Promise<PartyMember[]>
}

export const mockPartyMembersService: PartyMembersService = {
  async getPartyMembers() {
    return resolveMockData(PARTY_MEMBERS)
  },
}

export async function getPartyMembers(): Promise<PartyMember[]> {
  return mockPartyMembersService.getPartyMembers()
}

export type { PartyMember }
