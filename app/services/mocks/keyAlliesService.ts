export type KeyAlly = {
  id: string
  name: string
  location: string
  avatarUrl?: string
}

const KEY_ALLIES: KeyAlly[] = [
  { id: 'ally-1', name: 'Elder Morvain', location: 'Thornhollow' },
  { id: 'ally-2', name: 'Captain Elira Voss', location: 'Ravenwatch' },
  { id: 'ally-3', name: 'Brother Halwen', location: 'Ashenford' },
  { id: 'ally-4', name: 'Mira Quickstep', location: 'Goldmeadow' },
  { id: 'ally-5', name: 'Runesmith Baern', location: 'Stonewake' },
]

export function getKeyAllies(): KeyAlly[] {
  return KEY_ALLIES
}
