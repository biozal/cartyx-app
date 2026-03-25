import type { KeyAlly } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

const KEY_ALLIES: KeyAlly[] = [
  { id: 'ally-1', name: 'Elder Morvain', town: 'Thornhollow' },
  { id: 'ally-2', name: 'Captain Elira Voss', town: 'Ravenwatch' },
  { id: 'ally-3', name: 'Brother Halwen', town: 'Ashenford' },
  { id: 'ally-4', name: 'Mira Quickstep', town: 'Goldmeadow' },
  { id: 'ally-5', name: 'Runesmith Baern', town: 'Stonewake' },
]

export interface KeyAlliesService {
  getKeyAllies: () => Promise<KeyAlly[]>
}

export const mockKeyAlliesService: KeyAlliesService = {
  async getKeyAllies() {
    return resolveMockData(KEY_ALLIES)
  },
}

export async function getKeyAllies(): Promise<KeyAlly[]> {
  return mockKeyAlliesService.getKeyAllies()
}

export type { KeyAlly }
