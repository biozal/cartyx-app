import { describe, expect, it } from 'vitest'
import { getCatchUpContent, mockCatchUpService } from '~/services/mocks/catchUpService'

describe('mockCatchUpService', () => {
  it('returns realistic markdown recap content', async () => {
    const recap = await getCatchUpContent()

    expect(recap.title).toBe('Session Catch-Up')
    expect(recap.content).toContain('# Session 14')
    expect(recap.content).toContain('| Character | HP | Conditions |')
    expect(recap.lastUpdated).toBe('2026-03-22')
  })

  it('uses the consistent service interface', async () => {
    await expect(mockCatchUpService.getCatchUpContent()).resolves.toEqual(await getCatchUpContent())
  })

  it('returns defensive copies', async () => {
    const first = await getCatchUpContent()
    const second = await getCatchUpContent()

    expect(first).not.toBe(second)

    first.title = 'Mutated'
    first.content = 'Mutated'

    const fresh = await getCatchUpContent()
    expect(fresh.title).toBe('Session Catch-Up')
    expect(fresh.content).toContain('# Session 14')
  })
})
