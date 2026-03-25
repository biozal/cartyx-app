import type { PartyMember } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

export const mockPartyMembers: ReadonlyArray<Readonly<PartyMember>> = Object.freeze([
  Object.freeze({
    id: 'thorne-ironheart',
    name: 'Thorne Ironheart',
    characterClass: 'Paladin',
    race: 'Dwarf',
  }),
  Object.freeze({
    id: 'mira-shadowleaf',
    name: 'Mira Shadowleaf',
    characterClass: 'Ranger',
    race: 'Wood Elf',
  }),
  Object.freeze({
    id: 'kael-emberwake',
    name: 'Kael Emberwake',
    characterClass: 'Sorcerer',
    race: 'Tiefling',
  }),
  Object.freeze({
    id: 'seraphina-duskwhisper',
    name: 'Seraphina Duskwhisper',
    characterClass: 'Cleric',
    race: 'Half-Elf',
  }),
  Object.freeze({
    id: 'bram-tanglefoot',
    name: 'Bram Tanglefoot',
    characterClass: 'Rogue',
    race: 'Lightfoot Halfling',
  }),
])

export interface PartyMembersService {
  getPartyMembers: () => Promise<PartyMember[]>
}

export const mockPartyMembersService: PartyMembersService = {
  async getPartyMembers() {
    return resolveMockData(mockPartyMembers.map((member) => ({ ...member })))
  },
}

export async function getPartyMembers(): Promise<PartyMember[]> {
  return mockPartyMembersService.getPartyMembers()
}

export type { PartyMember }
