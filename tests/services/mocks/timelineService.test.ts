import { describe, expect, it } from 'vitest'
import { getTimelineEvents, mockTimelineService } from '~/services/mocks/timelineService'

describe('mockTimelineService', () => {
  it('returns timeline events with custom calendar dates', async () => {
    const events = await getTimelineEvents()

    expect(events.length).toBeGreaterThan(3)
    expect(events[0]?.calendarDate).toContain('Frostmark')
    expect(events[1]?.calendarDate).toContain('Ashfall')
  })

  it('returns defensive copies', async () => {
    const first = await getTimelineEvents()
    const second = await getTimelineEvents()

    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])

    first[0].summary = 'Mutated'
    expect((await getTimelineEvents())[0].summary).not.toBe('Mutated')
  })

  it('uses the consistent service interface', async () => {
    await expect(mockTimelineService.getTimelineEvents()).resolves.toEqual(await getTimelineEvents())
  })
})

