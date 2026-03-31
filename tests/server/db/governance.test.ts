import { describe, it, expect } from 'vitest'
import { INDEX_GOVERNANCE, getSeverity } from '~/server/db/governance'

describe('INDEX_GOVERNANCE registry', () => {
  it('contains entries for all five models', () => {
    expect(Object.keys(INDEX_GOVERNANCE)).toEqual(
      expect.arrayContaining(['User', 'Campaign', 'Session', 'Player', 'GMScreen']),
    )
  })

  it('every entry has a valid severity', () => {
    for (const [, entries] of Object.entries(INDEX_GOVERNANCE)) {
      for (const entry of entries) {
        expect(['critical', 'optional']).toContain(entry.severity)
        expect(Object.keys(entry.key).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('getSeverity', () => {
  it('returns critical for User email index', () => {
    expect(getSeverity('User', { email: 1 })).toBe('critical')
  })

  it('returns optional for User role index', () => {
    expect(getSeverity('User', { role: 1 })).toBe('optional')
  })

  it('returns critical for Player unique compound index', () => {
    expect(getSeverity('Player', { campaignId: 1, userId: 1 })).toBe('critical')
  })

  it('returns optional for GMScreen campaignId index', () => {
    expect(getSeverity('GMScreen', { campaignId: 1 })).toBe('optional')
  })

  it('returns undefined for unknown model', () => {
    expect(getSeverity('Unknown', { foo: 1 })).toBeUndefined()
  })

  it('returns undefined for unregistered index key', () => {
    expect(getSeverity('User', { firstName: 1 })).toBeUndefined()
  })
})
