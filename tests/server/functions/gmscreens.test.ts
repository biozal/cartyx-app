import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}))

vi.mock('~/server/session', () => ({ getSession: vi.fn() }))
vi.mock('~/server/db/connection', () => ({
  connectDB: vi.fn(),
  isDBConnected: vi.fn(() => true),
}))
vi.mock('~/server/db/models/User', () => ({
  User: { findOne: vi.fn() },
}))
vi.mock('~/server/db/models/Campaign', () => ({
  Campaign: { findById: vi.fn() },
}))
vi.mock('~/server/db/models/GMScreen', () => ({
  GMScreen: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    bulkWrite: vi.fn(),
  },
  GMSCREEN_LIMITS: {
    MAX_WINDOWS: 20,
    MAX_STACKS: 10,
    MAX_STACK_ITEMS: 50,
  },
  WINDOW_STATES: ['open', 'minimized', 'hidden'] as const,
}))
vi.mock('~/server/db/models/Note', () => ({
  Note: {
    find: vi.fn(),
  },
}))
vi.mock('~/server/utils/posthog', () => ({
  serverCaptureException: vi.fn(),
  serverCaptureEvent: vi.fn(),
}))

const mockMongoSession = {
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  endSession: vi.fn(),
}
vi.mock('mongoose', () => ({
  default: { startSession: vi.fn(() => mockMongoSession) },
}))

import { getSession } from '~/server/session'
import { User } from '~/server/db/models/User'
import { Campaign } from '~/server/db/models/Campaign'
import { GMScreen } from '~/server/db/models/GMScreen'
import { Note } from '~/server/db/models/Note'
import {
  listGMScreens,
  createGMScreen,
  renameGMScreen,
  deleteGMScreen,
  reorderGMScreens,
  getGMScreen,
  openWindow,
  updateWindow,
  closeWindow,
  removeDocumentRefsFromScreens,
  listGMScreensSchema,
  createGMScreenSchema,
  renameGMScreenSchema,
  deleteGMScreenSchema,
  reorderGMScreensSchema,
  getGMScreenSchema,
  openWindowSchema,
  updateWindowSchema,
  closeWindowSchema,
} from '~/server/functions/gmscreens'
import type { GMScreenData, GMScreenDetailData, WindowData } from '~/server/functions/gmscreens'
import { serverCaptureEvent, serverCaptureException } from '~/server/utils/posthog'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSession = {
  id: 'session-user-1',
  provider: 'google',
  name: 'Test User',
  email: 'test@example.com',
  avatar: null,
  role: 'gm',
  accessToken: null,
  refreshToken: null,
  tokenIssuedAt: 0,
}
const mockDbUser = { _id: 'dbuser-1', firstName: 'Test', lastName: 'User' }
const mockCampaign = {
  _id: 'camp-1',
  gameMasterId: 'dbuser-1',
  members: [{ userId: 'dbuser-1', role: 'gm' }],
}

function makeScreen(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'screen-1',
    campaignId: 'camp-1',
    name: 'General',
    tabOrder: 0,
    createdBy: 'dbuser-1',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    save: vi.fn(),
    deleteOne: vi.fn(),
    ...overrides,
  }
}

// Cast server functions to callable handler signatures
const _listGMScreens = listGMScreens as unknown as (args: { data: Record<string, unknown> }) => Promise<GMScreenData[]>
const _createGMScreen = createGMScreen as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; screen: GMScreenData }>
const _renameGMScreen = renameGMScreen as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; screen: GMScreenData }>
const _deleteGMScreen = deleteGMScreen as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; deletedTabOrder: number; remaining: GMScreenData[] }>
const _reorderGMScreens = reorderGMScreens as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; screens: GMScreenData[] }>
const _getGMScreen = getGMScreen as unknown as (args: { data: Record<string, unknown> }) => Promise<GMScreenDetailData>
const _openWindow = openWindow as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; window: WindowData; existed: boolean }>
const _updateWindow = updateWindow as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean; window: WindowData }>
const _closeWindow = closeWindow as unknown as (args: { data: Record<string, unknown> }) => Promise<{ success: boolean }>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue(mockSession)
  vi.mocked(User.findOne).mockResolvedValue(mockDbUser)
  vi.mocked(Campaign.findById).mockResolvedValue(mockCampaign)
  mockMongoSession.withTransaction.mockImplementation(async (fn: () => Promise<unknown>) => fn())
  mockMongoSession.endSession.mockReset()
})

// ---------------------------------------------------------------------------
// Auth — GM-only access (shared across all endpoints)
// ---------------------------------------------------------------------------

describe('GM-only access', () => {
  it('throws when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _listGMScreens({ data: { campaignId: 'camp-1' } }),
    ).rejects.toThrow('Not authenticated')
  })

  it('throws when user is not found', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    await expect(
      _listGMScreens({ data: { campaignId: 'camp-1' } }),
    ).rejects.toThrow('User not found')
  })

  it('throws when campaign is not found', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue(null)

    await expect(
      _listGMScreens({ data: { campaignId: 'camp-1' } }),
    ).rejects.toThrow('Campaign not found')
  })

  it('throws Forbidden when user is a player, not a GM', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue({
      _id: 'camp-1',
      gameMasterId: 'someone-else',
      members: [
        { userId: 'someone-else', role: 'gm' },
        { userId: 'dbuser-1', role: 'player' },
      ],
    })

    await expect(
      _listGMScreens({ data: { campaignId: 'camp-1' } }),
    ).rejects.toThrow('Forbidden')
  })

  it('allows access when user is gameMasterId (legacy campaign)', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue({
      _id: 'camp-1',
      gameMasterId: 'dbuser-1',
      members: [],
    })
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    const result = await _listGMScreens({ data: { campaignId: 'camp-1' } })
    expect(result).toEqual([])
  })

  it('allows access when user has gm role in members array', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue({
      _id: 'camp-1',
      gameMasterId: 'original-gm',
      members: [
        { userId: 'original-gm', role: 'gm' },
        { userId: 'dbuser-1', role: 'gm' },
      ],
    })
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    const result = await _listGMScreens({ data: { campaignId: 'camp-1' } })
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// listGMScreens
// ---------------------------------------------------------------------------

describe('listGMScreens', () => {
  it('returns screens sorted by tabOrder', async () => {
    const screens = [
      makeScreen({ _id: 'screen-1', name: 'General', tabOrder: 0 }),
      makeScreen({ _id: 'screen-2', name: 'Combat', tabOrder: 1 }),
    ]
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(screens) }),
    } as never)

    const result = await _listGMScreens({ data: { campaignId: 'camp-1' } })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('screen-1')
    expect(result[0].name).toBe('General')
    expect(result[0].tabOrder).toBe(0)
    expect(result[1].id).toBe('screen-2')
    expect(result[1].tabOrder).toBe(1)
  })

  it('returns an empty array when no screens exist', async () => {
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    const result = await _listGMScreens({ data: { campaignId: 'camp-1' } })
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createGMScreen
// ---------------------------------------------------------------------------

describe('createGMScreen', () => {
  it('creates a screen with the next tabOrder inside a transaction', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ tabOrder: 2 }) }),
        }),
      }),
    } as never)
    const created = makeScreen({ _id: 'screen-new', name: 'Combat', tabOrder: 3 })
    vi.mocked(GMScreen.create).mockResolvedValue([created] as never)

    const result = await _createGMScreen({ data: { campaignId: 'camp-1', name: 'Combat' } })

    expect(result.success).toBe(true)
    expect(result.screen.name).toBe('Combat')
    expect(vi.mocked(GMScreen.create).mock.calls[0][0]).toEqual([
      expect.objectContaining({
        campaignId: 'camp-1',
        name: 'Combat',
        tabOrder: 3,
        createdBy: 'dbuser-1',
      }),
    ])
    // Verify session options passed
    expect(vi.mocked(GMScreen.create).mock.calls[0][1]).toEqual({ session: mockMongoSession })
    expect(mockMongoSession.endSession).toHaveBeenCalled()
  })

  it('defaults tabOrder to 0 when no screens exist', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
        }),
      }),
    } as never)
    vi.mocked(GMScreen.create).mockResolvedValue([makeScreen({ tabOrder: 0 })] as never)

    await _createGMScreen({ data: { campaignId: 'camp-1', name: 'First' } })

    expect(vi.mocked(GMScreen.create).mock.calls[0][0]).toEqual([
      expect.objectContaining({ tabOrder: 0 }),
    ])
  })

  it('throws a clean error on duplicate name', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
        }),
      }),
    } as never)
    vi.mocked(GMScreen.create).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000, keyPattern: { campaignId: 1, name: 1 } }))

    await expect(
      _createGMScreen({ data: { campaignId: 'camp-1', name: 'General' } }),
    ).rejects.toThrow('A screen with that name already exists in this campaign')
  })

  it('retries on tabOrder collision then succeeds', async () => {
    const findOneMock = vi.mocked(GMScreen.findOne)
    findOneMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ tabOrder: 2 }) }),
        }),
      }),
    } as never)

    const tabOrderError = Object.assign(new Error('E11000 duplicate key tabOrder'), {
      code: 11000,
      keyPattern: { campaignId: 1, tabOrder: 1 },
    })
    const created = makeScreen({ _id: 'screen-retry', name: 'Retry', tabOrder: 3 })
    vi.mocked(GMScreen.create)
      .mockRejectedValueOnce(tabOrderError)
      .mockResolvedValueOnce([created] as never)

    // withTransaction must re-throw so the outer catch can retry
    mockMongoSession.withTransaction
      .mockImplementationOnce(async (fn: () => Promise<unknown>) => { await fn(); throw tabOrderError })
      .mockImplementationOnce(async (fn: () => Promise<unknown>) => fn())

    const result = await _createGMScreen({ data: { campaignId: 'camp-1', name: 'Retry' } })

    expect(result.success).toBe(true)
    expect(result.screen.name).toBe('Retry')
    expect(mockMongoSession.endSession).toHaveBeenCalledTimes(2)
  })

  it('throws user-friendly error when tabOrder retries are exhausted', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ tabOrder: 2 }) }),
        }),
      }),
    } as never)

    const tabOrderError = Object.assign(new Error('E11000 duplicate key tabOrder'), {
      code: 11000,
      keyPattern: { campaignId: 1, tabOrder: 1 },
    })
    mockMongoSession.withTransaction.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn()
      throw tabOrderError
    })
    vi.mocked(GMScreen.create).mockRejectedValue(tabOrderError)

    await expect(
      _createGMScreen({ data: { campaignId: 'camp-1', name: 'Collider' } }),
    ).rejects.toThrow('Could not create the screen due to a conflict. Please try again.')

    // Failure is captured exactly once (no double-reporting)
    expect(serverCaptureException).toHaveBeenCalledTimes(1)
  })

  it('fires gmscreen_created analytics event', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
        }),
      }),
    } as never)
    vi.mocked(GMScreen.create).mockResolvedValue([makeScreen()] as never)

    await _createGMScreen({ data: { campaignId: 'camp-1', name: 'New' } })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_created', {
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
    })
  })
})

// ---------------------------------------------------------------------------
// renameGMScreen
// ---------------------------------------------------------------------------

describe('renameGMScreen', () => {
  it('renames a screen', async () => {
    const screen = makeScreen()
    vi.mocked(GMScreen.findById).mockResolvedValue(screen as never)

    const result = await _renameGMScreen({
      data: { id: 'screen-1', campaignId: 'camp-1', name: 'Renamed' },
    })

    expect(result.success).toBe(true)
    expect(screen.name).toBe('Renamed')
    expect(screen.save).toHaveBeenCalled()
  })

  it('throws when screen is not found', async () => {
    vi.mocked(GMScreen.findById).mockResolvedValue(null)

    await expect(
      _renameGMScreen({ data: { id: 'nonexistent', campaignId: 'camp-1', name: 'New Name' } }),
    ).rejects.toThrow('Screen not found')
  })

  it('throws when screen belongs to a different campaign', async () => {
    const screen = makeScreen({ campaignId: 'camp-other' })
    vi.mocked(GMScreen.findById).mockResolvedValue(screen as never)

    await expect(
      _renameGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1', name: 'New Name' } }),
    ).rejects.toThrow('Forbidden')
  })

  it('throws a clean error on duplicate name', async () => {
    const screen = makeScreen()
    screen.save.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }))
    vi.mocked(GMScreen.findById).mockResolvedValue(screen as never)

    await expect(
      _renameGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1', name: 'Duplicate' } }),
    ).rejects.toThrow('A screen with that name already exists in this campaign')
  })

  it('fires gmscreen_renamed analytics event', async () => {
    vi.mocked(GMScreen.findById).mockResolvedValue(makeScreen() as never)

    await _renameGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1', name: 'Renamed' } })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_renamed', {
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
    })
  })
})

// ---------------------------------------------------------------------------
// deleteGMScreen
// ---------------------------------------------------------------------------

describe('deleteGMScreen', () => {
  it('deletes a screen atomically and returns remaining screens', async () => {
    const screen = makeScreen()
    vi.mocked(GMScreen.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(screen),
    } as never)
    vi.mocked(GMScreen.countDocuments).mockReturnValue({
      session: vi.fn().mockResolvedValue(3),
    } as never)
    vi.mocked(GMScreen.deleteOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({}),
    } as never)
    const remaining = [
      makeScreen({ _id: 'screen-2', name: 'Combat', tabOrder: 1 }),
    ]
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(remaining) }),
    } as never)

    const result = await _deleteGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(result.success).toBe(true)
    expect(result.deletedTabOrder).toBe(0)
    expect(result.remaining).toHaveLength(1)
    expect(GMScreen.deleteOne).toHaveBeenCalledWith({ _id: 'screen-1', campaignId: 'camp-1' })
    expect(mockMongoSession.endSession).toHaveBeenCalled()
  })

  it('rejects deleting the last screen atomically', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(makeScreen()),
    } as never)
    vi.mocked(GMScreen.countDocuments).mockReturnValue({
      session: vi.fn().mockResolvedValue(1),
    } as never)

    await expect(
      _deleteGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } }),
    ).rejects.toThrow('Cannot delete the last screen')
  })

  it('throws when screen is not found', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
    } as never)

    await expect(
      _deleteGMScreen({ data: { id: 'nonexistent', campaignId: 'camp-1' } }),
    ).rejects.toThrow('Screen not found')
  })

  it('fires gmscreen_deleted analytics event', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(makeScreen()),
    } as never)
    vi.mocked(GMScreen.countDocuments).mockReturnValue({
      session: vi.fn().mockResolvedValue(2),
    } as never)
    vi.mocked(GMScreen.deleteOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({}),
    } as never)
    vi.mocked(GMScreen.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _deleteGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_deleted', {
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
    })
  })
})

// ---------------------------------------------------------------------------
// reorderGMScreens
// ---------------------------------------------------------------------------

describe('reorderGMScreens', () => {
  it('reorders screens with bulkWrite inside a transaction', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'screen-1' },
          { _id: 'screen-2' },
          { _id: 'screen-3' },
        ]),
      }),
    } as never)
    vi.mocked(GMScreen.bulkWrite).mockResolvedValue({} as never)
    const reordered = [
      makeScreen({ _id: 'screen-3', tabOrder: 0 }),
      makeScreen({ _id: 'screen-1', tabOrder: 1 }),
      makeScreen({ _id: 'screen-2', tabOrder: 2 }),
    ]
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(reordered) }),
    } as never)

    const result = await _reorderGMScreens({
      data: { campaignId: 'camp-1', screenIds: ['screen-3', 'screen-1', 'screen-2'] },
    })

    expect(result.success).toBe(true)
    expect(result.screens).toHaveLength(3)
    // Verify two-phase bulkWrite: phase 1 (negative), phase 2 (final)
    expect(vi.mocked(GMScreen.bulkWrite)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(GMScreen.bulkWrite)).toHaveBeenNthCalledWith(1,
      [
        { updateOne: { filter: { _id: 'screen-3', campaignId: 'camp-1' }, update: { $set: { tabOrder: -1, updatedAt: expect.any(Date) } } } },
        { updateOne: { filter: { _id: 'screen-1', campaignId: 'camp-1' }, update: { $set: { tabOrder: -2, updatedAt: expect.any(Date) } } } },
        { updateOne: { filter: { _id: 'screen-2', campaignId: 'camp-1' }, update: { $set: { tabOrder: -3, updatedAt: expect.any(Date) } } } },
      ],
      { session: mockMongoSession },
    )
    expect(vi.mocked(GMScreen.bulkWrite)).toHaveBeenNthCalledWith(2,
      [
        { updateOne: { filter: { _id: 'screen-3', campaignId: 'camp-1' }, update: { $set: { tabOrder: 0 } } } },
        { updateOne: { filter: { _id: 'screen-1', campaignId: 'camp-1' }, update: { $set: { tabOrder: 1 } } } },
        { updateOne: { filter: { _id: 'screen-2', campaignId: 'camp-1' }, update: { $set: { tabOrder: 2 } } } },
      ],
      { session: mockMongoSession },
    )
    expect(mockMongoSession.endSession).toHaveBeenCalled()
  })

  it('throws when a screen ID does not belong to the campaign', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'screen-1' },
          { _id: 'screen-2' },
        ]),
      }),
    } as never)

    await expect(
      _reorderGMScreens({
        data: { campaignId: 'camp-1', screenIds: ['screen-1', 'screen-nonexistent'] },
      }),
    ).rejects.toThrow('Screen screen-nonexistent not found in this campaign')
  })

  it('throws on duplicate screen IDs', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'screen-1' },
          { _id: 'screen-2' },
        ]),
      }),
    } as never)

    await expect(
      _reorderGMScreens({
        data: { campaignId: 'camp-1', screenIds: ['screen-1', 'screen-1'] },
      }),
    ).rejects.toThrow('Duplicate screen IDs in reorder request')
  })

  it('throws when screens are missing from the reorder request', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'screen-1' },
          { _id: 'screen-2' },
          { _id: 'screen-3' },
        ]),
      }),
    } as never)

    await expect(
      _reorderGMScreens({
        data: { campaignId: 'camp-1', screenIds: ['screen-1', 'screen-2'] },
      }),
    ).rejects.toThrow('Missing screen screen-3 in reorder request')
  })

  it('fires gmscreens_reordered analytics event', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      session: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'screen-1' }, { _id: 'screen-2' }]),
      }),
    } as never)
    vi.mocked(GMScreen.bulkWrite).mockResolvedValue({} as never)
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as never)

    await _reorderGMScreens({
      data: { campaignId: 'camp-1', screenIds: ['screen-2', 'screen-1'] },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreens_reordered', {
      campaign_id: 'camp-1',
      screen_count: 2,
    })
  })
})

// ---------------------------------------------------------------------------
// getGMScreen — hydration
// ---------------------------------------------------------------------------

describe('getGMScreen', () => {
  it('returns a screen with hydrated window and stack refs', async () => {
    const screenDoc = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      name: 'General',
      tabOrder: 0,
      createdBy: 'dbuser-1',
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
      windows: [
        { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 10, y: 20, width: 400, height: 300, zIndex: 1 },
        { _id: 'win-2', collection: 'note', documentId: 'note-2', state: 'minimized', x: null, y: null, width: null, height: null, zIndex: 0 },
      ],
      stacks: [
        {
          _id: 'stack-1',
          name: 'NPCs',
          x: 0,
          y: 0,
          items: [
            { _id: 'si-1', collection: 'note', documentId: 'note-3', label: 'Gandalf' },
          ],
        },
      ],
    }
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(screenDoc),
    } as never)
    // Note.find batch fetch for hydration — all three note IDs
    vi.mocked(Note.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'note-1', title: 'Session Notes' },
        { _id: 'note-2', title: 'Combat Log' },
        { _id: 'note-3', title: 'NPC: Gandalf' },
      ]),
    } as never)

    const result = await _getGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(result.id).toBe('screen-1')
    expect(result.windows).toHaveLength(2)
    expect(result.windows[0].id).toBe('win-1')
    expect(result.windows[0].collection).toBe('note')
    expect(result.windows[0].documentId).toBe('note-1')
    expect(result.windows[1].state).toBe('minimized')
    expect(result.stacks).toHaveLength(1)
    expect(result.stacks[0].name).toBe('NPCs')
    expect(result.stacks[0].items).toHaveLength(1)
    expect(result.stacks[0].items[0].label).toBe('Gandalf')

    // Hydrated map keyed by "collection:documentId"
    expect(result.hydrated['note:note-1']).toEqual({ id: 'note-1', collection: 'note', title: 'Session Notes' })
    expect(result.hydrated['note:note-2']).toEqual({ id: 'note-2', collection: 'note', title: 'Combat Log' })
    expect(result.hydrated['note:note-3']).toEqual({ id: 'note-3', collection: 'note', title: 'NPC: Gandalf' })

    // Note.find was called once with all unique IDs batched, scoped by campaignId
    expect(Note.find).toHaveBeenCalledTimes(1)
    expect(Note.find).toHaveBeenCalledWith(
      { _id: { $in: expect.arrayContaining(['note-1', 'note-2', 'note-3']) }, campaignId: 'camp-1' },
      '_id title',
    )
  })

  it('returns empty hydrated map when screen has no refs', async () => {
    const screenDoc = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      name: 'Empty',
      tabOrder: 0,
      createdBy: 'dbuser-1',
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
      windows: [],
      stacks: [],
    }
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(screenDoc),
    } as never)

    const result = await _getGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(result.windows).toEqual([])
    expect(result.stacks).toEqual([])
    expect(result.hydrated).toEqual({})
    expect(Note.find).not.toHaveBeenCalled()
  })

  it('omits deleted/missing documents from hydrated map gracefully', async () => {
    const screenDoc = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      name: 'General',
      tabOrder: 0,
      createdBy: 'dbuser-1',
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
      windows: [
        { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 0, y: 0, width: 400, height: 300, zIndex: 0 },
        { _id: 'win-2', collection: 'note', documentId: 'note-deleted', state: 'open', x: 0, y: 0, width: 400, height: 300, zIndex: 0 },
      ],
      stacks: [],
    }
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(screenDoc),
    } as never)
    // Only note-1 exists; note-deleted is missing from DB
    vi.mocked(Note.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'note-1', title: 'Existing Note' }]),
    } as never)

    const result = await _getGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(result.hydrated['note:note-1']).toBeDefined()
    expect(result.hydrated['note:note-deleted']).toBeUndefined()
    // Window ref is still present — client can detect unresolved ref
    expect(result.windows).toHaveLength(2)
  })

  it('skips unknown collection types without error', async () => {
    const screenDoc = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      name: 'Mixed',
      tabOrder: 0,
      createdBy: 'dbuser-1',
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
      windows: [
        { _id: 'win-1', collection: 'unknown_type', documentId: 'doc-1', state: 'open', x: 0, y: 0, width: 400, height: 300, zIndex: 0 },
      ],
      stacks: [],
    }
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(screenDoc),
    } as never)

    const result = await _getGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    expect(result.windows).toHaveLength(1)
    expect(result.hydrated).toEqual({})
    expect(Note.find).not.toHaveBeenCalled()
  })

  it('deduplicates refs when same document appears in multiple windows/stacks', async () => {
    const screenDoc = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      name: 'Dupes',
      tabOrder: 0,
      createdBy: 'dbuser-1',
      createdAt: new Date('2026-03-01'),
      updatedAt: new Date('2026-03-01'),
      windows: [
        { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 0, y: 0, width: 400, height: 300, zIndex: 0 },
      ],
      stacks: [
        {
          _id: 'stack-1',
          name: 'Refs',
          x: 0,
          y: 0,
          items: [
            { _id: 'si-1', collection: 'note', documentId: 'note-1', label: 'Same Note' },
          ],
        },
      ],
    }
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(screenDoc),
    } as never)
    vi.mocked(Note.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'note-1', title: 'Shared Note' }]),
    } as never)

    const result = await _getGMScreen({ data: { id: 'screen-1', campaignId: 'camp-1' } })

    // Only one fetch call despite same ID appearing twice
    expect(Note.find).toHaveBeenCalledTimes(1)
    const fetchedIds = vi.mocked(Note.find).mock.calls[0][0] as unknown as { _id: { $in: string[] } }
    expect(fetchedIds._id.$in).toHaveLength(1)
    expect(result.hydrated['note:note-1'].title).toBe('Shared Note')
  })

  it('throws when screen is not found', async () => {
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never)

    await expect(
      _getGMScreen({ data: { id: 'nonexistent', campaignId: 'camp-1' } }),
    ).rejects.toThrow('Screen not found')
  })
})

// ---------------------------------------------------------------------------
// removeDocumentRefsFromScreens — cleanup
// ---------------------------------------------------------------------------

describe('removeDocumentRefsFromScreens', () => {
  it('removes matching window refs and stack items, returns distinct screen count', async () => {
    // find() for affected screens
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([{ _id: 'screen-1' }, { _id: 'screen-2' }, { _id: 'screen-3' }]),
    } as never)
    vi.mocked(GMScreen.updateMany)
      .mockResolvedValueOnce({ modifiedCount: 2 } as never) // windows
      .mockResolvedValueOnce({ modifiedCount: 1 } as never) // stacks

    const result = await removeDocumentRefsFromScreens('camp-1', 'note', 'note-1')

    // Affected-screen query uses $or to find all screens with either ref type
    expect(GMScreen.find).toHaveBeenCalledWith(
      {
        campaignId: 'camp-1',
        $or: [
          { 'windows.collection': 'note', 'windows.documentId': 'note-1' },
          { 'stacks.items.collection': 'note', 'stacks.items.documentId': 'note-1' },
        ],
      },
      '_id',
    )

    expect(GMScreen.updateMany).toHaveBeenCalledTimes(2)
    // Pull from windows + refresh updatedAt
    expect(GMScreen.updateMany).toHaveBeenCalledWith(
      { campaignId: 'camp-1', 'windows.collection': 'note', 'windows.documentId': 'note-1' },
      { $pull: { windows: { collection: 'note', documentId: 'note-1' } }, $set: { updatedAt: expect.any(Date) } },
    )
    // Pull from stacks.$[].items + refresh updatedAt
    expect(GMScreen.updateMany).toHaveBeenCalledWith(
      { campaignId: 'camp-1', 'stacks.items.collection': 'note', 'stacks.items.documentId': 'note-1' },
      { $pull: { 'stacks.$[].items': { collection: 'note', documentId: 'note-1' } }, $set: { updatedAt: expect.any(Date) } },
    )
    // Returns true distinct count from the find query, not Math.max
    expect(result).toBe(3)
  })

  it('returns 0 and skips updates when no screens reference the document', async () => {
    vi.mocked(GMScreen.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([]),
    } as never)

    const result = await removeDocumentRefsFromScreens('camp-1', 'note', 'note-999')

    expect(result).toBe(0)
    expect(GMScreen.updateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Zod schemas — validation
// ---------------------------------------------------------------------------

describe('getGMScreenSchema', () => {
  it('rejects empty id', () => {
    expect(getGMScreenSchema.safeParse({ id: '', campaignId: 'camp-1' }).success).toBe(false)
  })

  it('rejects empty campaignId', () => {
    expect(getGMScreenSchema.safeParse({ id: 's-1', campaignId: '' }).success).toBe(false)
  })

  it('accepts valid input', () => {
    expect(getGMScreenSchema.safeParse({ id: 's-1', campaignId: 'camp-1' }).success).toBe(true)
  })
})

describe('listGMScreensSchema', () => {
  it('rejects empty campaignId', () => {
    expect(listGMScreensSchema.safeParse({ campaignId: '' }).success).toBe(false)
  })

  it('rejects whitespace-only campaignId', () => {
    expect(listGMScreensSchema.safeParse({ campaignId: '   ' }).success).toBe(false)
  })

  it('accepts valid campaignId', () => {
    expect(listGMScreensSchema.safeParse({ campaignId: 'camp-1' }).success).toBe(true)
  })
})

describe('createGMScreenSchema', () => {
  it('rejects empty name', () => {
    expect(createGMScreenSchema.safeParse({ campaignId: 'camp-1', name: '' }).success).toBe(false)
  })

  it('rejects whitespace-only name', () => {
    expect(createGMScreenSchema.safeParse({ campaignId: 'camp-1', name: '   ' }).success).toBe(false)
  })

  it('accepts valid input', () => {
    expect(createGMScreenSchema.safeParse({ campaignId: 'camp-1', name: 'Combat' }).success).toBe(true)
  })
})

describe('renameGMScreenSchema', () => {
  it('rejects when id is missing', () => {
    expect(renameGMScreenSchema.safeParse({ campaignId: 'camp-1', name: 'New' }).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(renameGMScreenSchema.safeParse({ id: 's-1', campaignId: 'camp-1', name: '' }).success).toBe(false)
  })

  it('rejects whitespace-only name', () => {
    expect(renameGMScreenSchema.safeParse({ id: 's-1', campaignId: 'camp-1', name: '   ' }).success).toBe(false)
  })
})

describe('deleteGMScreenSchema', () => {
  it('rejects when id is missing', () => {
    expect(deleteGMScreenSchema.safeParse({ campaignId: 'camp-1' }).success).toBe(false)
  })

  it('rejects empty campaignId', () => {
    expect(deleteGMScreenSchema.safeParse({ id: 's-1', campaignId: '' }).success).toBe(false)
  })
})

describe('reorderGMScreensSchema', () => {
  it('rejects empty screenIds array', () => {
    expect(reorderGMScreensSchema.safeParse({ campaignId: 'camp-1', screenIds: [] }).success).toBe(false)
  })

  it('rejects when screenIds is missing', () => {
    expect(reorderGMScreensSchema.safeParse({ campaignId: 'camp-1' }).success).toBe(false)
  })

  it('accepts valid input', () => {
    expect(reorderGMScreensSchema.safeParse({ campaignId: 'camp-1', screenIds: ['s-1', 's-2'] }).success).toBe(true)
  })

  it('trims whitespace from screenId entries', () => {
    const result = reorderGMScreensSchema.safeParse({ campaignId: 'camp-1', screenIds: ['  s-1  ', '  s-2  '] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.screenIds).toEqual(['s-1', 's-2'])
    }
  })

  it('rejects whitespace-only screenId entries', () => {
    expect(reorderGMScreensSchema.safeParse({ campaignId: 'camp-1', screenIds: ['   '] }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// openWindow
// ---------------------------------------------------------------------------

describe('openWindow', () => {
  function makeScreenWithWindows(windows: Array<Record<string, unknown>> = []) {
    return {
      _id: 'screen-1',
      campaignId: 'camp-1',
      windows,
      updatedAt: new Date('2026-03-01'),
      save: vi.fn(),
    }
  }

  it('creates a new window with zIndex bumped above existing', async () => {
    const screen = makeScreenWithWindows([
      { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', zIndex: 3 },
    ])
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    const result = await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-2' },
    })

    expect(result.success).toBe(true)
    expect(result.existed).toBe(false)
    expect(result.window.collection).toBe('note')
    expect(result.window.documentId).toBe('note-2')
    expect(result.window.state).toBe('open')
    expect(result.window.zIndex).toBe(4)
    expect(result.window.x).toBeNull()
    expect(result.window.y).toBeNull()
    expect(screen.save).toHaveBeenCalled()
  })

  it('focuses existing window instead of creating duplicate', async () => {
    const existingWin = { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'minimized', zIndex: 1 }
    const otherWin = { _id: 'win-2', collection: 'note', documentId: 'note-2', state: 'open', zIndex: 5 }
    const screen = makeScreenWithWindows([existingWin, otherWin])
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    const result = await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
    })

    expect(result.success).toBe(true)
    expect(result.existed).toBe(true)
    expect(result.window.id).toBe('win-1')
    expect(result.window.state).toBe('open')
    expect(result.window.zIndex).toBe(6) // max(1,5) + 1
    expect(screen.save).toHaveBeenCalled()
  })

  it('enforces the 20-window cap', async () => {
    const windows = Array.from({ length: 20 }, (_, i) => ({
      _id: `win-${i}`,
      collection: 'note',
      documentId: `note-${i}`,
      state: 'open',
      zIndex: i,
    }))
    const screen = makeScreenWithWindows(windows)
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    await expect(
      _openWindow({
        data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-new' },
      }),
    ).rejects.toThrow('A screen cannot have more than 20 windows')
  })

  it('allows opening when at cap if ref already exists (focus path)', async () => {
    const windows = Array.from({ length: 20 }, (_, i) => ({
      _id: `win-${i}`,
      collection: 'note',
      documentId: `note-${i}`,
      state: 'open',
      zIndex: i,
    }))
    const screen = makeScreenWithWindows(windows)
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    const result = await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-5' },
    })

    expect(result.existed).toBe(true)
    expect(result.success).toBe(true)
  })

  it('throws when screen is not found', async () => {
    vi.mocked(GMScreen.findOne).mockResolvedValue(null)

    await expect(
      _openWindow({
        data: { screenId: 'nonexistent', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
      }),
    ).rejects.toThrow('Screen not found')
  })

  it('creates window with zIndex 1 on empty screen', async () => {
    const screen = makeScreenWithWindows([])
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    const result = await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
    })

    expect(result.window.zIndex).toBe(1)
    expect(result.existed).toBe(false)
  })

  it('initializes windows array on document when missing', async () => {
    const screen = {
      _id: 'screen-1',
      campaignId: 'camp-1',
      windows: undefined as Array<Record<string, unknown>> | undefined,
      updatedAt: new Date('2026-03-01'),
      save: vi.fn(),
    }
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    const result = await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
    })

    expect(result.success).toBe(true)
    expect(result.existed).toBe(false)
    expect(Array.isArray(screen.windows)).toBe(true)
    expect(screen.windows).toHaveLength(1)
    expect(screen.save).toHaveBeenCalled()
  })

  it('fires gmscreen_window_opened analytics event for new window', async () => {
    const screen = makeScreenWithWindows([])
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_window_opened', expect.objectContaining({
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
    }))
  })

  it('fires gmscreen_window_focused analytics event for existing window', async () => {
    const screen = makeScreenWithWindows([
      { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'hidden', zIndex: 0 },
    ])
    vi.mocked(GMScreen.findOne).mockResolvedValue(screen as never)

    await _openWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', collection: 'note', documentId: 'note-1' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_window_focused', {
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
      window_id: 'win-1',
    })
  })
})

// ---------------------------------------------------------------------------
// updateWindow
// ---------------------------------------------------------------------------

describe('updateWindow', () => {
  it('updates only provided layout fields via positional $set', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        windows: [
          { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 100, y: 200, width: 400, height: 300, zIndex: 5 },
        ],
      }),
    } as never)

    const result = await _updateWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1', x: 100, y: 200 },
    })

    expect(result.success).toBe(true)
    expect(result.window.x).toBe(100)
    expect(result.window.y).toBe(200)

    // Verify $set only includes x, y, and updatedAt — not width/height/zIndex/state
    const setArg = vi.mocked(GMScreen.updateOne).mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(setArg.$set).toHaveProperty('windows.$.x', 100)
    expect(setArg.$set).toHaveProperty('windows.$.y', 200)
    expect(setArg.$set).toHaveProperty('updatedAt')
    expect(setArg.$set).not.toHaveProperty('windows.$.width')
    expect(setArg.$set).not.toHaveProperty('windows.$.height')
    expect(setArg.$set).not.toHaveProperty('windows.$.zIndex')
    expect(setArg.$set).not.toHaveProperty('windows.$.state')
  })

  it('updates state to minimized', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        windows: [
          { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'minimized', x: 0, y: 0, width: 400, height: 300, zIndex: 1 },
        ],
      }),
    } as never)

    const result = await _updateWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1', state: 'minimized' },
    })

    expect(result.success).toBe(true)
    expect(result.window.state).toBe('minimized')
    const setArg = vi.mocked(GMScreen.updateOne).mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(setArg.$set).toHaveProperty('windows.$.state', 'minimized')
  })

  it('updates zIndex for bring-to-front', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        windows: [
          { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 0, y: 0, width: 400, height: 300, zIndex: 10 },
        ],
      }),
    } as never)

    const result = await _updateWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1', zIndex: 10 },
    })

    expect(result.success).toBe(true)
    expect(result.window.zIndex).toBe(10)
  })

  it('updates all fields at once (move + resize + z + state)', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        windows: [
          { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: 50, y: 60, width: 500, height: 400, zIndex: 7 },
        ],
      }),
    } as never)

    const result = await _updateWindow({
      data: {
        screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1',
        x: 50, y: 60, width: 500, height: 400, zIndex: 7, state: 'open',
      },
    })

    expect(result.success).toBe(true)
    const setArg = vi.mocked(GMScreen.updateOne).mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(setArg.$set).toHaveProperty('windows.$.x', 50)
    expect(setArg.$set).toHaveProperty('windows.$.y', 60)
    expect(setArg.$set).toHaveProperty('windows.$.width', 500)
    expect(setArg.$set).toHaveProperty('windows.$.height', 400)
    expect(setArg.$set).toHaveProperty('windows.$.zIndex', 7)
    expect(setArg.$set).toHaveProperty('windows.$.state', 'open')
  })

  it('accepts nullable x/y for auto-layout support', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)
    vi.mocked(GMScreen.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        windows: [
          { _id: 'win-1', collection: 'note', documentId: 'note-1', state: 'open', x: null, y: null, width: null, height: null, zIndex: 1 },
        ],
      }),
    } as never)

    const result = await _updateWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1', x: null, y: null },
    })

    expect(result.success).toBe(true)
    const setArg = vi.mocked(GMScreen.updateOne).mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(setArg.$set).toHaveProperty('windows.$.x', null)
    expect(setArg.$set).toHaveProperty('windows.$.y', null)
  })

  it('throws Screen not found when the screen does not exist', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never)
    vi.mocked(GMScreen.countDocuments).mockResolvedValue(0 as never)

    await expect(
      _updateWindow({
        data: { screenId: 'nonexistent', campaignId: 'camp-1', windowId: 'win-1', x: 10 },
      }),
    ).rejects.toThrow('Screen not found')
  })

  it('throws Window not found when screen exists but window does not', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never)
    vi.mocked(GMScreen.countDocuments).mockResolvedValue(1 as never)

    await expect(
      _updateWindow({
        data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'nonexistent', x: 10 },
      }),
    ).rejects.toThrow('Window not found')
  })
})

// ---------------------------------------------------------------------------
// closeWindow
// ---------------------------------------------------------------------------

describe('closeWindow', () => {
  it('removes a window via $pull and refreshes updatedAt', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)

    const result = await _closeWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1' },
    })

    expect(result.success).toBe(true)
    expect(GMScreen.updateOne).toHaveBeenCalledWith(
      { _id: 'screen-1', campaignId: 'camp-1', 'windows._id': 'win-1' },
      {
        $pull: { windows: { _id: 'win-1' } },
        $set: { updatedAt: expect.any(Date) },
      },
    )
  })

  it('throws when screen is not found', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never)
    vi.mocked(GMScreen.countDocuments).mockResolvedValue(0 as never)

    await expect(
      _closeWindow({
        data: { screenId: 'nonexistent', campaignId: 'camp-1', windowId: 'win-1' },
      }),
    ).rejects.toThrow('Screen not found')
  })

  it('fires gmscreen_window_closed analytics event', async () => {
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as never)

    await _closeWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'win-1' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'gmscreen_window_closed', {
      campaign_id: 'camp-1',
      screen_id: 'screen-1',
      window_id: 'win-1',
    })
  })

  it('does not fire analytics or churn state when window was not present (no-op close)', async () => {
    // matchedCount 0 because the filter includes windows._id — screen exists but window doesn't
    vi.mocked(GMScreen.updateOne).mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never)
    vi.mocked(GMScreen.countDocuments).mockResolvedValue(1 as never)

    const result = await _closeWindow({
      data: { screenId: 'screen-1', campaignId: 'camp-1', windowId: 'nonexistent-win' },
    })

    expect(result.success).toBe(true)
    expect(serverCaptureEvent).not.toHaveBeenCalled()
    // Verify updatedAt was not touched — updateOne filter didn't match, so no $set ran
    expect(GMScreen.updateOne).toHaveBeenCalledWith(
      { _id: 'screen-1', campaignId: 'camp-1', 'windows._id': 'nonexistent-win' },
      expect.anything(),
    )
  })
})

// ---------------------------------------------------------------------------
// Window Zod schemas
// ---------------------------------------------------------------------------

describe('openWindowSchema', () => {
  it('rejects empty screenId', () => {
    expect(openWindowSchema.safeParse({ screenId: '', campaignId: 'c', collection: 'note', documentId: 'd' }).success).toBe(false)
  })

  it('rejects empty collection', () => {
    expect(openWindowSchema.safeParse({ screenId: 's', campaignId: 'c', collection: '', documentId: 'd' }).success).toBe(false)
  })

  it('rejects empty documentId', () => {
    expect(openWindowSchema.safeParse({ screenId: 's', campaignId: 'c', collection: 'note', documentId: '' }).success).toBe(false)
  })

  it('accepts valid input', () => {
    expect(openWindowSchema.safeParse({ screenId: 's-1', campaignId: 'c-1', collection: 'note', documentId: 'd-1' }).success).toBe(true)
  })
})

describe('updateWindowSchema', () => {
  it('rejects empty windowId', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: '' }).success).toBe(false)
  })

  it('rejects when no updatable fields are provided', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w' }).success).toBe(false)
  })

  it('rejects invalid state', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', state: 'invalid' }).success).toBe(false)
  })

  it('accepts valid state enum values', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', state: 'open' }).success).toBe(true)
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', state: 'minimized' }).success).toBe(true)
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', state: 'hidden' }).success).toBe(true)
  })

  it('accepts partial layout fields', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', x: 100 }).success).toBe(true)
  })

  it('accepts nullable x and y', () => {
    expect(updateWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: 'w', x: null, y: null }).success).toBe(true)
  })
})

describe('closeWindowSchema', () => {
  it('rejects empty windowId', () => {
    expect(closeWindowSchema.safeParse({ screenId: 's', campaignId: 'c', windowId: '' }).success).toBe(false)
  })

  it('accepts valid input', () => {
    expect(closeWindowSchema.safeParse({ screenId: 's-1', campaignId: 'c-1', windowId: 'w-1' }).success).toBe(true)
  })
})
