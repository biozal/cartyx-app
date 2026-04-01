import { describe, it, expect } from 'vitest'
import { normalizeTag, normalizeTags } from '~/server/utils/helpers'

describe('normalizeTag', () => {
  it('trims whitespace', () => {
    expect(normalizeTag('  combat  ')).toBe('combat')
  })

  it('lowercases the tag', () => {
    expect(normalizeTag('Combat')).toBe('combat')
  })

  it('strips a leading #', () => {
    expect(normalizeTag('#lore')).toBe('lore')
  })

  it('strips # after trimming and lowercasing', () => {
    expect(normalizeTag('  #NPC  ')).toBe('npc')
  })

  it('returns null for empty string', () => {
    expect(normalizeTag('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(normalizeTag('   ')).toBeNull()
  })

  it('returns null for a lone #', () => {
    expect(normalizeTag('#')).toBeNull()
  })

  it('returns null for # with whitespace', () => {
    expect(normalizeTag('  #  ')).toBeNull()
  })
})

describe('normalizeTags', () => {
  it('normalizes an array of tags', () => {
    expect(normalizeTags(['#Combat', '  lore ', 'NPC'])).toEqual(['combat', 'lore', 'npc'])
  })

  it('removes empty/invalid tags', () => {
    expect(normalizeTags(['#', '', '  ', 'valid'])).toEqual(['valid'])
  })

  it('removes duplicates after normalization', () => {
    expect(normalizeTags(['Combat', '#combat', '  COMBAT  '])).toEqual(['combat'])
  })

  it('returns empty array for all-invalid input', () => {
    expect(normalizeTags(['#', '', '  '])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([])
  })
})
