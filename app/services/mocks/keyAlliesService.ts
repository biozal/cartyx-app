import type { KeyAlly } from '~/services/mocks/types'
import { resolveMockData } from '~/services/mocks/utils'

export const mockKeyAllies: ReadonlyArray<Readonly<KeyAlly>> = Object.freeze([
  Object.freeze({ id: 'ally-1', name: 'Elder Morvain', town: 'Thornhollow' }),
  Object.freeze({ id: 'ally-2', name: 'Captain Elira Voss', town: 'Ravenwatch' }),
  Object.freeze({ id: 'ally-3', name: 'Brother Halwen', town: 'Ashenford' }),
  Object.freeze({ id: 'ally-4', name: 'Mira Quickstep', town: 'Goldmeadow' }),
  Object.freeze({ id: 'ally-5', name: 'Runesmith Baern', town: 'Stonewake' }),
])

export interface KeyAlliesService {
  getKeyAllies: () => Promise<KeyAlly[]>
}

export const mockKeyAlliesService: KeyAlliesService = {
  async getKeyAllies() {
    return resolveMockData(mockKeyAllies.map((ally) => ({ ...ally })))
  },
}

export async function getKeyAllies(): Promise<KeyAlly[]> {
  return mockKeyAlliesService.getKeyAllies()
}

export type { KeyAlly }
