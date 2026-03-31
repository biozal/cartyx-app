import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncMock = vi.hoisted(() => ({
  syncCollectionsAndIndexes: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('~/server/db/inspect', () => syncMock)

import { bootstrapDB, isBootstrapped, __resetBootstrapForTests } from '~/server/db/bootstrap'

describe('bootstrapDB', () => {
  beforeEach(() => {
    __resetBootstrapForTests()
    syncMock.syncCollectionsAndIndexes.mockClear().mockResolvedValue(undefined)
  })

  it('calls syncCollectionsAndIndexes on first call', async () => {
    await bootstrapDB()
    expect(syncMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(isBootstrapped()).toBe(true)
  })

  it('runs only once per process (idempotent)', async () => {
    await bootstrapDB()
    await bootstrapDB()
    expect(syncMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
  })

  it('does not swallow errors from sync', async () => {
    syncMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('sync error'))
    await expect(bootstrapDB()).rejects.toThrow('sync error')
  })

  it('retries after a previous failure (bootstrapped flag stays false)', async () => {
    syncMock.syncCollectionsAndIndexes.mockRejectedValueOnce(new Error('transient'))

    await expect(bootstrapDB()).rejects.toThrow('transient')
    expect(isBootstrapped()).toBe(false)

    // Second call should retry and succeed
    await bootstrapDB()
    expect(syncMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(2)
    expect(isBootstrapped()).toBe(true)
  })

  it('concurrent calls share the same bootstrap and only run setup once', async () => {
    syncMock.syncCollectionsAndIndexes.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    )

    const [r1, r2] = await Promise.all([bootstrapDB(), bootstrapDB()])

    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()
    expect(syncMock.syncCollectionsAndIndexes).toHaveBeenCalledTimes(1)
    expect(isBootstrapped()).toBe(true)
  })
})
