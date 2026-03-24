import { describe, it, expect } from 'vitest'
import { playSearchSchema } from '~/routes/campaigns/$campaignId/play'

/**
 * Route-level tests for the play route's search validation.
 * These tests cover the Zod schema that derives the active tab from search params.
 */

describe('Play route search validation', () => {
  it('defaults to dashboard when no tab param', () => {
    expect(playSearchSchema.parse({})).toEqual({ tab: 'dashboard' })
  })

  it('defaults to dashboard for invalid tab value', () => {
    expect(playSearchSchema.parse({ tab: 'bogus' })).toEqual({ tab: 'dashboard' })
  })

  it('honors tab=dashboard', () => {
    expect(playSearchSchema.parse({ tab: 'dashboard' })).toEqual({ tab: 'dashboard' })
  })

  it('honors tab=tabletop', () => {
    expect(playSearchSchema.parse({ tab: 'tabletop' })).toEqual({ tab: 'tabletop' })
  })
})
