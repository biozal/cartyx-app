import { describe, it, expect, vi, beforeEach } from 'vitest'

const { userMock, campaignMock, playerMock, sessionMock, gmScreenMock } = vi.hoisted(() => {
  const make = () => ({
    createCollection: vi.fn().mockResolvedValue(undefined),
    ensureIndexes: vi.fn().mockResolvedValue(undefined),
  })
  return {
    userMock: make(),
    campaignMock: make(),
    playerMock: make(),
    sessionMock: make(),
    gmScreenMock: make(),
  }
})

vi.mock('~/server/db/models/User', () => ({ User: userMock }))
vi.mock('~/server/db/models/Campaign', () => ({ Campaign: campaignMock }))
vi.mock('~/server/db/models/Player', () => ({ Player: playerMock }))
vi.mock('~/server/db/models/Session', () => ({ Session: sessionMock }))
vi.mock('~/server/db/models/GMScreen', () => ({ GMScreen: gmScreenMock }))

import { bootstrapDB, isBootstrapped, __resetBootstrapForTests } from '~/server/db/bootstrap'

const allModels = [userMock, campaignMock, playerMock, sessionMock, gmScreenMock]

describe('bootstrapDB', () => {
  beforeEach(() => {
    __resetBootstrapForTests()
    for (const m of allModels) {
      m.createCollection.mockClear().mockResolvedValue(undefined)
      m.ensureIndexes.mockClear().mockResolvedValue(undefined)
    }
  })

  it('creates all collections and ensures indexes', async () => {
    await bootstrapDB()

    for (const m of allModels) {
      expect(m.createCollection).toHaveBeenCalledTimes(1)
      expect(m.ensureIndexes).toHaveBeenCalledTimes(1)
    }
  })

  it('runs only once per process (idempotent)', async () => {
    await bootstrapDB()
    await bootstrapDB()

    for (const m of allModels) {
      expect(m.createCollection).toHaveBeenCalledTimes(1)
      expect(m.ensureIndexes).toHaveBeenCalledTimes(1)
    }
  })

  it('does not swallow errors from createCollection', async () => {
    userMock.createCollection.mockRejectedValueOnce(new Error('collection error'))

    await expect(bootstrapDB()).rejects.toThrow('collection error')
  })

  it('does not swallow errors from ensureIndexes', async () => {
    sessionMock.ensureIndexes.mockRejectedValueOnce(new Error('index error'))

    await expect(bootstrapDB()).rejects.toThrow('index error')
  })

  it('retries after a previous failure (bootstrapped flag stays false)', async () => {
    userMock.createCollection.mockRejectedValueOnce(new Error('transient'))

    await expect(bootstrapDB()).rejects.toThrow('transient')
    expect(isBootstrapped()).toBe(false)

    // Second call should retry and succeed
    await bootstrapDB()

    for (const m of allModels) {
      expect(m.createCollection).toHaveBeenCalled()
      expect(m.ensureIndexes).toHaveBeenCalled()
    }
    expect(isBootstrapped()).toBe(true)
  })

  it('concurrent calls share the same bootstrap and only run setup once', async () => {
    // Make createCollection slow so both callers overlap
    for (const m of allModels) {
      m.createCollection.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      )
    }

    const [r1, r2] = await Promise.all([bootstrapDB(), bootstrapDB()])

    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()

    for (const m of allModels) {
      expect(m.createCollection).toHaveBeenCalledTimes(1)
      expect(m.ensureIndexes).toHaveBeenCalledTimes(1)
    }
    expect(isBootstrapped()).toBe(true)
  })
})
