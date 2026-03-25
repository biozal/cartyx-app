import { describe, expect, it } from 'vitest'
import { getSessions, mockSessionsService } from '~/services/mocks/sessionsService'

describe('mockSessionsService', () => {
  it('returns campaign session summaries in descending order', async () => {
    const sessions = await getSessions()

    expect(sessions.length).toBeGreaterThan(3)
    expect(sessions[0]).toMatchObject({
      number: 14,
      name: 'Ashes at Emberfall',
    })
    expect(sessions[1].number).toBeLessThan(sessions[0].number)
  })

  it('uses the consistent service interface', async () => {
    await expect(mockSessionsService.getSessions()).resolves.toEqual(await getSessions())
  })
})

