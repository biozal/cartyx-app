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

import { connectDB, isDBConnected, __resetConnectPromiseForTests } from '~/server/db/connection'

describe('connectDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetConnectPromiseForTests()
    mongooseMock.connect.mockResolvedValue(undefined)
    mongooseMock.connection.readyState = 0
    bootstrapMock.isBootstrapped.mockReturnValue(false)
    bootstrapMock.bootstrapDB.mockResolvedValue(undefined)
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

  it('waits for in-flight connection when readyState is 2 (connecting)', async () => {
    // Simulate a slow connect so the first call sets readyState to 2
    let resolveConnect!: () => void
    mongooseMock.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          // Transition to "connecting" state
          mongooseMock.connection.readyState = 2
          resolveConnect = () => {
            mongooseMock.connection.readyState = 1
            resolve()
          }
        }),
    )

    // First caller starts connecting
    const first = connectDB()

    // Second caller arrives while readyState is 2
    const second = connectDB()

    // Resolve the connection
    resolveConnect()

    await Promise.all([first, second])

    // connect should only have been called once
    expect(mongooseMock.connect).toHaveBeenCalledTimes(1)
    // bootstrap should still run
    expect(bootstrapMock.bootstrapDB).toHaveBeenCalled()
  })

  it('shares one connect attempt when two callers race before readyState flips', async () => {
    // Both callers enter while readyState is still 0 — the first creates a
    // connectPromise, the second must reuse it instead of calling connect again.
    let resolveConnect!: () => void
    mongooseMock.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          // readyState stays 0 during this tick to simulate the race window
          resolveConnect = () => {
            mongooseMock.connection.readyState = 1
            resolve()
          }
        }),
    )

    // Both callers start in the same microtask before readyState changes
    const first = connectDB()
    const second = connectDB()

    resolveConnect()
    await Promise.all([first, second])

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1)
    expect(bootstrapMock.bootstrapDB).toHaveBeenCalled()
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
