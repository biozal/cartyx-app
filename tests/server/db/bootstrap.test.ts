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

import { bootstrapDB, resetBootstrapFlag } from '~/server/db/bootstrap'

const allModels = [userMock, campaignMock, playerMock, sessionMock, gmScreenMock]

describe('bootstrapDB', () => {
  beforeEach(() => {
    resetBootstrapFlag()
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
})
