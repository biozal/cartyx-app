import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InspectResult } from '~/server/db/inspect'
import type { BootstrapPolicy } from '~/server/db/policy'

const inspectMock = vi.hoisted(() => ({
  syncCollectionsAndIndexes: vi.fn().mockResolvedValue(undefined),
  ensureCollections: vi.fn().mockResolvedValue(undefined),
  inspectIndexes: vi.fn().mockResolvedValue({ diffs: [], ok: true, hasCriticalDrift: false }),
}))

vi.mock('~/server/db/inspect', () => inspectMock)
vi.mock('~/server/db/policy', () => ({
  getBootstrapPolicy: vi.fn(),
}))

import {
  bootstrapDB,
  isBootstrapped,
  BootstrapError,
  __resetBootstrapForTests,
} from '~/server/db/bootstrap'

/** Helper to build a policy with overrides. */
function makePolicy(overrides: Partial<BootstrapPolicy> = {}): BootstrapPolicy {
  return {
    environment: 'development',
    syncIndexes: true,
    verifyCriticalIndexes: false,
    failOnCriticalDrift: false,
    autoIndex: true,
    timeoutMs: 30_000,
    ...overrides,
  }
}

const devPolicy = makePolicy()

const prodPolicy = makePolicy({
  environment: 'production',
  syncIndexes: false,
  verifyCriticalIndexes: true,
  failOnCriticalDrift: true,
  autoIndex: false,
  timeoutMs: 10_000,
})

const stagingPolicy = makePolicy({
  environment: 'staging',
  syncIndexes: false,
  verifyCriticalIndexes: true,
  failOnCriticalDrift: false,
  autoIndex: false,
  timeoutMs: 15_000,
})

/** An InspectResult with critical drift. */
const criticalDriftResult: InspectResult = {
  diffs: [
    {
      model: 'User',
      collection: 'users',
      missing: [{ key: { email: 1 }, options: { unique: true, sparse: true }, severity: 'critical' }],
      extra: [],
      optionMismatches: [],
    },
  ],
  ok: false,
  hasCriticalDrift: true,
}

/** An InspectResult with only optional drift. */
const optionalDriftResult: InspectResult = {
  diffs: [
    {
      model: 'User',
      collection: 'users',
      missing: [{ key: { role: 1 }, severity: 'optional' }],
      extra: [],
      optionMismatches: [],
    },
  ],
  ok: false,
  hasCriticalDrift: false,
}

describe('bootstrapDB', () => {
  beforeEach(() => {
    __resetBootstrapForTests()
    inspectMock.syncCollectionsAndIndexes.mockClear().mockResolvedValue(undefined)
    inspectMock.ensureCollections.mockClear().mockResolvedValue(undefined)
    inspectMock.inspectIndexes
      .mockClear()
      .mockResolvedValue({ diffs: [], ok: true, hasCriticalDrift: false })
  })

  // ── Development policy ──────────────────────────────────────────────

  it('calls syncCollectionsAndIndexes with development policy', async () => {
    await bootstrapDB(devPolicy)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(inspectMock.ensureCollections).not.toHaveBeenCalled()
    expect(inspectMock.inspectIndexes).not.toHaveBeenCalled()
    expect(isBootstrapped()).toBe(true)
  })

  // ── Production policy ───────────────────────────────────────────────

  it('calls ensureCollections + inspectIndexes with production policy (no drift)', async () => {
    await bootstrapDB(prodPolicy)
    expect(inspectMock.ensureCollections).toHaveBeenCalledTimes(1)
    expect(inspectMock.inspectIndexes).toHaveBeenCalledTimes(1)
    expect(inspectMock.syncCollectionsAndIndexes).not.toHaveBeenCalled()
    expect(isBootstrapped()).toBe(true)
  })

  it('throws BootstrapError on critical drift in production', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(criticalDriftResult)

    await expect(bootstrapDB(prodPolicy)).rejects.toThrow(BootstrapError)
    expect(isBootstrapped()).toBe(false)
  })

  it('BootstrapError includes environment and actionable details', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(criticalDriftResult)

    try {
      await bootstrapDB(prodPolicy)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(BootstrapError)
      const e = err as BootstrapError
      expect(e.environment).toBe('production')
      expect(e.details).toHaveLength(1)
      expect(e.details[0]).toContain('email')
      expect(e.message).toContain('npm run db:sync')
    }
  })

  it('does not fail on optional-only drift in production', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(optionalDriftResult)
    await bootstrapDB(prodPolicy)
    expect(isBootstrapped()).toBe(true)
  })

  // ── Staging policy ──────────────────────────────────────────────────

  it('warns but succeeds on critical drift in staging', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(criticalDriftResult)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await bootstrapDB(stagingPolicy)

    expect(isBootstrapped()).toBe(true)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('critical index problem')

    warnSpy.mockRestore()
  })

  // ── Timeout ─────────────────────────────────────────────────────────

  it('times out when bootstrap exceeds timeoutMs', async () => {
    inspectMock.ensureCollections.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    )
    const policy = makePolicy({
      environment: 'production',
      syncIndexes: false,
      verifyCriticalIndexes: true,
      failOnCriticalDrift: true,
      timeoutMs: 50,
    })

    await expect(bootstrapDB(policy)).rejects.toThrow('timed out')
    expect(isBootstrapped()).toBe(false)
  })

  // ── Idempotency & concurrency ───────────────────────────────────────

  it('runs only once per process (idempotent)', async () => {
    await bootstrapDB(devPolicy)
    await bootstrapDB(devPolicy)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
  })

  it('concurrent calls share the same bootstrap and only run setup once', async () => {
    inspectMock.syncCollectionsAndIndexes.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    )

    const [r1, r2] = await Promise.all([bootstrapDB(devPolicy), bootstrapDB(devPolicy)])

    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(isBootstrapped()).toBe(true)
  })

  // ── Error handling ──────────────────────────────────────────────────

  it('does not swallow errors from sync', async () => {
    inspectMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('sync error'))
    await expect(bootstrapDB(devPolicy)).rejects.toThrow('sync error')
  })

  it('retries after a previous failure (bootstrapped flag stays false)', async () => {
    inspectMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('transient'))

    await expect(bootstrapDB(devPolicy)).rejects.toThrow('transient')
    expect(isBootstrapped()).toBe(false)

    await bootstrapDB(devPolicy)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(2)
    expect(isBootstrapped()).toBe(true)
  })
})
