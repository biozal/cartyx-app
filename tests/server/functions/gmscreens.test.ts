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
    deleteOne: vi.fn(),
    bulkWrite: vi.fn(),
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
import {
  listGMScreens,
  createGMScreen,
  renameGMScreen,
  deleteGMScreen,
  reorderGMScreens,
  listGMScreensSchema,
  createGMScreenSchema,
  renameGMScreenSchema,
  deleteGMScreenSchema,
  reorderGMScreensSchema,
} from '~/server/functions/gmscreens'
import type { GMScreenData } from '~/server/functions/gmscreens'
import { serverCaptureEvent } from '~/server/utils/posthog'

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
    // Verify bulkWrite was called with campaignId in each filter
    expect(vi.mocked(GMScreen.bulkWrite)).toHaveBeenCalledWith(
      [
        { updateOne: { filter: { _id: 'screen-3', campaignId: 'camp-1' }, update: { $set: { tabOrder: 0, updatedAt: expect.any(Date) } } } },
        { updateOne: { filter: { _id: 'screen-1', campaignId: 'camp-1' }, update: { $set: { tabOrder: 1, updatedAt: expect.any(Date) } } } },
        { updateOne: { filter: { _id: 'screen-2', campaignId: 'camp-1' }, update: { $set: { tabOrder: 2, updatedAt: expect.any(Date) } } } },
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
// Zod schemas — validation
// ---------------------------------------------------------------------------

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
