import { describe, it, expect, vi, beforeEach } from 'vitest'

const inspectMock = vi.hoisted(() => ({
  syncCollectionsAndIndexes: vi.fn().mockResolvedValue(undefined),
  ensureCollections: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('~/server/db/inspect', () => inspectMock)

import { bootstrapDB, isBootstrapped, __resetBootstrapForTests } from '~/server/db/bootstrap'

describe('bootstrapDB', () => {
  beforeEach(() => {
    __resetBootstrapForTests()
    inspectMock.syncCollectionsAndIndexes.mockClear().mockResolvedValue(undefined)
    inspectMock.ensureCollections.mockClear().mockResolvedValue(undefined)
  })

  it('calls syncCollectionsAndIndexes in non-production mode', async () => {
    await bootstrapDB(false)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(inspectMock.ensureCollections).not.toHaveBeenCalled()
    expect(isBootstrapped()).toBe(true)
  })

  it('calls only ensureCollections in production mode', async () => {
    await bootstrapDB(true)
    expect(inspectMock.ensureCollections).toHaveBeenCalledTimes(1)
    expect(inspectMock.syncCollectionsAndIndexes).not.toHaveBeenCalled()
    expect(isBootstrapped()).toBe(true)
  })

  it('runs only once per process (idempotent)', async () => {
    await bootstrapDB(false)
    await bootstrapDB(false)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
  })

  it('does not swallow errors from sync', async () => {
    inspectMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('sync error'))
    await expect(bootstrapDB(false)).rejects.toThrow('sync error')
  })

  it('retries after a previous failure (bootstrapped flag stays false)', async () => {
    inspectMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('transient'))

    await expect(bootstrapDB(false)).rejects.toThrow('transient')
    expect(isBootstrapped()).toBe(false)

    // Second call should retry and succeed
    await bootstrapDB(false)
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(2)
    expect(isBootstrapped()).toBe(true)
  })

  it('concurrent calls share the same bootstrap and only run setup once', async () => {
    inspectMock.syncCollectionsAndIndexes.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    )

    const [r1, r2] = await Promise.all([bootstrapDB(false), bootstrapDB(false)])

    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()
    expect(inspectMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(isBootstrapped()).toBe(true)
  })
})
