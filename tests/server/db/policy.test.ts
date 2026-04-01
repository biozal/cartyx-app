import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveEnvironment, getBootstrapPolicy } from '~/server/db/policy'
import type { BootstrapEnvironment } from '~/server/db/policy'

describe('resolveEnvironment', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved.BOOTSTRAP_ENV = process.env.BOOTSTRAP_ENV
    saved.VERCEL_ENV = process.env.VERCEL_ENV
    saved.NODE_ENV = process.env.NODE_ENV
    delete process.env.BOOTSTRAP_ENV
    delete process.env.VERCEL_ENV
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  it('returns explicit BOOTSTRAP_ENV when set to production', () => {
    process.env.BOOTSTRAP_ENV = 'production'
    expect(resolveEnvironment()).toBe('production')
  })

  it('returns explicit BOOTSTRAP_ENV when set to staging', () => {
    process.env.BOOTSTRAP_ENV = 'staging'
    expect(resolveEnvironment()).toBe('staging')
  })

  it('returns explicit BOOTSTRAP_ENV when set to development', () => {
    process.env.BOOTSTRAP_ENV = 'development'
    expect(resolveEnvironment()).toBe('development')
  })

  it('ignores invalid BOOTSTRAP_ENV values', () => {
    process.env.BOOTSTRAP_ENV = 'invalid'
    process.env.NODE_ENV = 'development'
    expect(resolveEnvironment()).toBe('development')
  })

  it('BOOTSTRAP_ENV takes precedence over VERCEL_ENV', () => {
    process.env.BOOTSTRAP_ENV = 'development'
    process.env.VERCEL_ENV = 'production'
    expect(resolveEnvironment()).toBe('development')
  })

  it('returns production when VERCEL_ENV is production', () => {
    process.env.VERCEL_ENV = 'production'
    expect(resolveEnvironment()).toBe('production')
  })

  it('returns staging when VERCEL_ENV is preview', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(resolveEnvironment()).toBe('staging')
  })

  it('returns production when NODE_ENV is production and no Vercel env', () => {
    process.env.NODE_ENV = 'production'
    expect(resolveEnvironment()).toBe('production')
  })

  it('returns development when NODE_ENV is not production and no overrides', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveEnvironment()).toBe('development')
  })

  it('defaults to development when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test'
    expect(resolveEnvironment()).toBe('development')
  })
})

describe('getBootstrapPolicy', () => {
  it('returns a policy with the correct environment field', () => {
    const envs: BootstrapEnvironment[] = ['production', 'staging', 'development']
    for (const env of envs) {
      expect(getBootstrapPolicy(env).environment).toBe(env)
    }
  })

  it('production policy disables syncIndexes and autoIndex, enables critical verification', () => {
    const p = getBootstrapPolicy('production')
    expect(p.syncIndexes).toBe(false)
    expect(p.autoIndex).toBe(false)
    expect(p.verifyCriticalIndexes).toBe(true)
    expect(p.failOnCriticalDrift).toBe(true)
    expect(p.timeoutMs).toBeGreaterThan(0)
  })

  it('staging policy verifies critical indexes but does not fail on drift', () => {
    const p = getBootstrapPolicy('staging')
    expect(p.syncIndexes).toBe(false)
    expect(p.autoIndex).toBe(false)
    expect(p.verifyCriticalIndexes).toBe(true)
    expect(p.failOnCriticalDrift).toBe(false)
    expect(p.timeoutMs).toBeGreaterThan(0)
  })

  it('development policy syncs indexes and enables autoIndex', () => {
    const p = getBootstrapPolicy('development')
    expect(p.syncIndexes).toBe(true)
    expect(p.autoIndex).toBe(true)
    expect(p.verifyCriticalIndexes).toBe(false)
    expect(p.failOnCriticalDrift).toBe(false)
    expect(p.timeoutMs).toBeGreaterThan(0)
  })
})
