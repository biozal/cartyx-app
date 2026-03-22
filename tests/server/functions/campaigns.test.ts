import { describe, it, expect } from 'vitest'

// Unit tests for campaign utility functions (not requiring DB)
import { generateInviteCode, validateUrl, parseMaxPlayers } from '~/server/utils/helpers'

describe('generateInviteCode', () => {
  it('returns a string in XXXX-XXXX format', () => {
    const code = generateInviteCode()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
    expect(codes.size).toBeGreaterThan(90)
  })
})

describe('validateUrl', () => {
  it('returns null for empty/undefined input', () => {
    expect(validateUrl(null)).toBe(null)
    expect(validateUrl(undefined)).toBe(null)
    expect(validateUrl('')).toBe(null)
    expect(validateUrl('   ')).toBe(null)
  })

  it('returns false for non-http/https URLs', () => {
    expect(validateUrl('ftp://example.com')).toBe(false)
    expect(validateUrl('javascript:alert(1)')).toBe(false)
    expect(validateUrl('not-a-url')).toBe(false)
  })

  it('returns normalized URL for valid http/https', () => {
    expect(validateUrl('https://example.com')).toBe('https://example.com/')
    expect(validateUrl('http://discord.gg/test')).toBe('http://discord.gg/test')
    expect(validateUrl('  https://example.com  ')).toBe('https://example.com/')
  })
})

describe('parseMaxPlayers', () => {
  it('clamps values between 1 and 10', () => {
    expect(parseMaxPlayers(0)).toBe(1)
    expect(parseMaxPlayers(-5)).toBe(1)
    expect(parseMaxPlayers(11)).toBe(10)
    expect(parseMaxPlayers(100)).toBe(10)
  })

  it('returns parsed value for valid input', () => {
    expect(parseMaxPlayers(4)).toBe(4)
    expect(parseMaxPlayers('6')).toBe(6)
    expect(parseMaxPlayers(1)).toBe(1)
    expect(parseMaxPlayers(10)).toBe(10)
  })

  it('defaults to 4 for undefined, clamps NaN to 1', () => {
    expect(parseMaxPlayers(undefined)).toBe(4)
    expect(parseMaxPlayers('abc')).toBe(1) // parseInt('abc') = NaN → clamps to min 1
  })
})
