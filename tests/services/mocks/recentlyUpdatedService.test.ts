import { describe, expect, it } from 'vitest'
import {
  getRecentlyUpdatedItems,
  mockRecentlyUpdatedService,
} from '~/services/mocks/recentlyUpdatedService'

describe('mockRecentlyUpdatedService', () => {
  it('returns recently modified wiki items', async () => {
    const items = await getRecentlyUpdatedItems()

    expect(items).toHaveLength(5)
    expect(items[0]).toMatchObject({
      type: 'Location',
      title: 'Thornhollow Catacombs',
    })
  })

  it('returns defensive copies', async () => {
    const first = await getRecentlyUpdatedItems()
    const second = await getRecentlyUpdatedItems()

    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])

    first[0].title = 'Mutated'
    expect((await getRecentlyUpdatedItems())[0].title).toBe('Thornhollow Catacombs')
  })

  it('uses the consistent service interface', async () => {
    await expect(mockRecentlyUpdatedService.getRecentlyUpdatedItems()).resolves.toEqual(
      await getRecentlyUpdatedItems(),
    )
  })
})
