import { describe, it, expect, vi, beforeEach } from 'vitest'

const mongooseMock = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  connection: { readyState: 0 },
  models: {},
}))

const bootstrapMock = vi.hoisted(() => ({
  bootstrapDB: vi.fn().mockResolvedValue(undefined),
  isBootstrapped: vi.fn().mockReturnValue(false),
}))

vi.mock('mongoose', () => ({ default: mongooseMock }))
vi.mock('~/server/db/bootstrap', () => bootstrapMock)
vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: vi.fn(),
}))

import { connectDB, isDBConnected } from '~/server/db/connection'

describe('connectDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mongooseMock.connection.readyState = 0
    bootstrapMock.isBootstrapped.mockReturnValue(false)
    process.env.MONGODB_URI = 'mongodb://localhost/test'
  })

  it('connects and bootstraps on first call', async () => {
    await connectDB()

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://localhost/test')
    expect(bootstrapMock.bootstrapDB).toHaveBeenCalledTimes(1)
  })

  it('skips connect but retries bootstrap when already connected and bootstrap failed', async () => {
    mongooseMock.connection.readyState = 1
    bootstrapMock.isBootstrapped.mockReturnValue(false)

    await connectDB()

    expect(mongooseMock.connect).not.toHaveBeenCalled()
    expect(bootstrapMock.bootstrapDB).toHaveBeenCalledTimes(1)
  })

  it('skips both connect and bootstrap when already connected and bootstrapped', async () => {
    mongooseMock.connection.readyState = 1
    bootstrapMock.isBootstrapped.mockReturnValue(true)

    await connectDB()

    expect(mongooseMock.connect).not.toHaveBeenCalled()
    expect(bootstrapMock.bootstrapDB).not.toHaveBeenCalled()
  })

  it('returns early when MONGODB_URI is not set', async () => {
    delete process.env.MONGODB_URI

    await connectDB()

    expect(mongooseMock.connect).not.toHaveBeenCalled()
    expect(bootstrapMock.bootstrapDB).not.toHaveBeenCalled()
  })

  it('rethrows errors from bootstrap', async () => {
    bootstrapMock.bootstrapDB.mockRejectedValueOnce(new Error('bootstrap failed'))

    await expect(connectDB()).rejects.toThrow('bootstrap failed')
  })
})

describe('isDBConnected', () => {
  it('returns true when readyState is 1', () => {
    mongooseMock.connection.readyState = 1
    expect(isDBConnected()).toBe(true)
  })

  it('returns false when readyState is 0', () => {
    mongooseMock.connection.readyState = 0
    expect(isDBConnected()).toBe(false)
  })
})
