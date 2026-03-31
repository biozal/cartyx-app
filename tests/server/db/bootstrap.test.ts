import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { InspectResult } from '~/server/db/inspect'
import type { BootstrapPolicy } from '~/server/db/policy'

const inspectMock = vi.hoisted(() => ({
  syncCollectionsAndIndexes: vi.fn().mockResolvedValue(undefined),
  ensureCollections: vi.fn().mockResolvedValue(undefined),
  inspectIndexes: vi.fn().mockResolvedValue({ diffs: [], ok: true, hasCriticalDrift: false }),
}))

const posthogMock = vi.hoisted(() => ({
  serverCaptureEvent: vi.fn(),
  serverCaptureException: vi.fn(),
}))

vi.mock('~/server/db/inspect', () => inspectMock)
vi.mock('~/server/db/policy', () => ({
  getBootstrapPolicy: vi.fn(),
}))
vi.mock('~/server/utils/posthog', () => posthogMock)

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
    posthogMock.serverCaptureEvent.mockClear()

    // Silence console output during tests by default.
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

    await bootstrapDB(stagingPolicy)

    expect(isBootstrapped()).toBe(true)
    const warnSpy = vi.mocked(console.warn)
    // First call is structured warning line, subsequent calls are drift details.
    expect(warnSpy.mock.calls[0][0]).toContain('[bootstrap] warning env=staging action=verify')
    expect(warnSpy.mock.calls[0][0]).toContain('critical_drift=true')
  })

  // ── Timeout ─────────────────────────────────────────────────────────

  it('times out when bootstrap exceeds timeoutMs and emits failure event', async () => {
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

    // Timeout errors now flow through structured failure logging with action.
    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.failure',
      expect.objectContaining({
        bootstrap_env: 'production',
        action: 'ensure_collections',
        duration_ms: expect.any(Number),
        error: expect.stringContaining('timed out'),
      }),
    )
    const errorSpy = vi.mocked(console.error)
    expect(errorSpy.mock.calls.some((c) => c[0].includes('[bootstrap] failure'))).toBe(true)
  })

  it('suppresses success/warning emissions from timed-out underlying work', async () => {
    // ensureCollections is slow (triggers timeout), but eventually resolves.
    // After timeout, the underlying work continues and would normally emit
    // a success log — the cancellation token should suppress it.
    let resolveEnsure!: () => void
    inspectMock.ensureCollections.mockImplementation(
      () => new Promise<void>((r) => { resolveEnsure = r }),
    )
    const policy = makePolicy({
      environment: 'production',
      syncIndexes: false,
      verifyCriticalIndexes: false,
      failOnCriticalDrift: true,
      timeoutMs: 50,
    })

    await expect(bootstrapDB(policy)).rejects.toThrow('timed out')

    // Clear mocks to isolate post-timeout emissions.
    posthogMock.serverCaptureEvent.mockClear()
    vi.mocked(console.log).mockClear()

    // Let the underlying work complete after the timeout.
    resolveEnsure()
    // Flush microtasks so the async work runs.
    await new Promise((r) => setTimeout(r, 10))

    // No success event should have been emitted after the timeout.
    const successCalls = posthogMock.serverCaptureEvent.mock.calls.filter(
      (c: unknown[]) => c[1] === 'db.bootstrap.success',
    )
    expect(successCalls).toHaveLength(0)
    const successLogs = vi.mocked(console.log).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('[bootstrap] success'),
    )
    expect(successLogs).toHaveLength(0)
  })

  it('prevents overlapping bootstrap attempts after timeout', async () => {
    let resolveFirst!: () => void
    let firstCallCount = 0
    inspectMock.syncCollectionsAndIndexes.mockImplementation(() => {
      firstCallCount++
      if (firstCallCount === 1) {
        // First call: slow (will timeout)
        return new Promise<void>((r) => { resolveFirst = r })
      }
      // Second call: fast
      return Promise.resolve()
    })

    const slowPolicy = makePolicy({ timeoutMs: 50 })

    // First attempt times out.
    await expect(bootstrapDB(slowPolicy)).rejects.toThrow('timed out')
    expect(isBootstrapped()).toBe(false)

    // Second attempt should wait for the first's underlying work to settle
    // before starting, not race with it.
    const retryPromise = bootstrapDB(devPolicy)

    // Let the first attempt's underlying work finish.
    resolveFirst()

    await retryPromise
    expect(isBootstrapped()).toBe(true)
    // Both calls should have happened sequentially, not concurrently.
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(2)
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

  // ── Observability ───────────────────────────────────────────────────

  it('emits db.bootstrap.start and db.bootstrap.success PostHog events on dev sync', async () => {
    await bootstrapDB(devPolicy)

    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.start',
      expect.objectContaining({ bootstrap_env: 'development', sync_indexes: true }),
    )
    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.success',
      expect.objectContaining({ bootstrap_env: 'development', action: 'sync', duration_ms: expect.any(Number) }),
    )
  })

  it('emits db.bootstrap.success with verify action on production (no drift)', async () => {
    await bootstrapDB(prodPolicy)

    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.success',
      expect.objectContaining({
        bootstrap_env: 'production',
        action: 'verify',
        duration_ms: expect.any(Number),
        models_checked: expect.any(Number),
        indexes_ok: true,
      }),
    )
  })

  it('emits db.bootstrap.failure on production critical drift', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(criticalDriftResult)

    await expect(bootstrapDB(prodPolicy)).rejects.toThrow(BootstrapError)

    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.failure',
      expect.objectContaining({
        bootstrap_env: 'production',
        critical_drift: true,
        duration_ms: expect.any(Number),
      }),
    )
  })

  it('emits db.bootstrap.warning on staging critical drift', async () => {
    inspectMock.inspectIndexes.mockResolvedValueOnce(criticalDriftResult)

    await bootstrapDB(stagingPolicy)

    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.warning',
      expect.objectContaining({
        bootstrap_env: 'staging',
        critical_drift: true,
        duration_ms: expect.any(Number),
      }),
    )
  })

  it('emits db.bootstrap.failure with action on unexpected errors', async () => {
    inspectMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('mongo down'))

    await expect(bootstrapDB(devPolicy)).rejects.toThrow('mongo down')

    expect(posthogMock.serverCaptureEvent).toHaveBeenCalledWith(
      'server',
      'db.bootstrap.failure',
      expect.objectContaining({
        bootstrap_env: 'development',
        action: 'sync',
        duration_ms: expect.any(Number),
        error: 'mongo down',
      }),
    )
  })

  it('logs structured start/success to console on dev sync', async () => {
    await bootstrapDB(devPolicy)

    const logSpy = vi.mocked(console.log)
    expect(logSpy.mock.calls.some((c) => c[0].includes('[bootstrap] start env=development'))).toBe(true)
    expect(logSpy.mock.calls.some((c) => c[0].includes('[bootstrap] success env=development action=sync'))).toBe(true)
  })
})
