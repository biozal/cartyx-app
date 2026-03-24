export type PartyMember = {
  id: string
  name: string
  characterClass: string
  race: string
  avatarUrl?: string
}

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

export function getPartyMembers(): PartyMember[] {
  return PARTY_MEMBERS
}
