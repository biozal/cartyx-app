import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for campaign utility functions (not requiring DB)
import { generateInviteCode, validateUrl, parseMaxPlayers } from '~/server/utils/helpers'

describe('generateInviteCode', () => {
  it('returns a string in XXXX-XXXX format', () => {
    const code = generateInviteCode()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
    expect(codes.size).toBeGreaterThan(90)
  })
})

describe('validateUrl', () => {
  it('returns null for empty/undefined input', () => {
    expect(validateUrl(null)).toBe(null)
    expect(validateUrl(undefined)).toBe(null)
    expect(validateUrl('')).toBe(null)
    expect(validateUrl('   ')).toBe(null)
  })

  it('returns false for non-http/https URLs', () => {
    expect(validateUrl('ftp://example.com')).toBe(false)
    expect(validateUrl('javascript:alert(1)')).toBe(false)
    expect(validateUrl('not-a-url')).toBe(false)
  })

  it('returns normalized URL for valid http/https', () => {
    expect(validateUrl('https://example.com')).toBe('https://example.com/')
    expect(validateUrl('http://discord.gg/test')).toBe('http://discord.gg/test')
    expect(validateUrl('  https://example.com  ')).toBe('https://example.com/')
  })
})

describe('parseMaxPlayers', () => {
  it('clamps values between 1 and 10', () => {
    expect(parseMaxPlayers(0)).toBe(1)
    expect(parseMaxPlayers(-5)).toBe(1)
    expect(parseMaxPlayers(11)).toBe(10)
    expect(parseMaxPlayers(100)).toBe(10)
  })

  it('returns parsed value for valid input', () => {
    expect(parseMaxPlayers(4)).toBe(4)
    expect(parseMaxPlayers('6')).toBe(6)
    expect(parseMaxPlayers(1)).toBe(1)
    expect(parseMaxPlayers(10)).toBe(10)
  })

  it('defaults to 4 for undefined, clamps NaN to 1', () => {
    expect(parseMaxPlayers(undefined)).toBe(4)
    expect(parseMaxPlayers('abc')).toBe(1) // parseInt('abc') = NaN → clamps to min 1
  })
})

// ---------------------------------------------------------------------------
// Server function tests
// ---------------------------------------------------------------------------

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
  User: { findOne: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('~/server/db/models/Campaign', () => ({
  Campaign: { find: vi.fn(), findById: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn(), exists: vi.fn() },
}))
vi.mock('~/server/utils/posthog', () => ({ serverCaptureException: vi.fn(), serverCaptureEvent: vi.fn() }))

import { getSession } from '~/server/session'
import { User } from '~/server/db/models/User'
import { Campaign } from '~/server/db/models/Campaign'
import { listCampaigns, getCampaign, createCampaign, updateCampaign, joinCampaign } from '~/server/functions/campaigns'
import { serverCaptureEvent } from '~/server/utils/posthog'

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
const mockDbUser = { _id: 'dbuser-1' }

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'camp-1',
    gameMasterId: 'dbuser-1',
    name: 'Test Campaign',
    description: '',
    status: 'active',
    inviteCode: 'ABCD-EFGH',
    imagePath: null,
    callUrl: null,
    dndBeyondUrl: null,
    maxPlayers: 4,
    schedule: null,
    members: [{ userId: 'dbuser-1', role: 'gm' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue(mockSession)
  vi.mocked(User.findOne).mockResolvedValue(mockDbUser)
  vi.mocked(User.updateOne).mockResolvedValue({} as never)
})

// Cast server functions to callable handler signatures
const _listCampaigns = listCampaigns as unknown as () => Promise<unknown[]>
const _getCampaign = getCampaign as unknown as (args: { data: { id: string } }) => Promise<unknown>
const _createCampaign = createCampaign as unknown as (args: { data: Record<string, unknown> }) => Promise<unknown>
const _updateCampaign = updateCampaign as unknown as (args: { data: Record<string, unknown> }) => Promise<unknown>
const _joinCampaign = joinCampaign as unknown as (args: { data: { inviteCode: string } }) => Promise<unknown>

describe('listCampaigns', () => {
  it('returns only campaigns where the user is a member', async () => {
    const campaign = makeCampaign()
    const mockSort = vi.fn().mockResolvedValue([campaign])
    vi.mocked(Campaign.find).mockReturnValue({ sort: mockSort } as never)

    const result = await _listCampaigns()

    expect(Campaign.find).toHaveBeenCalledWith({
      $or: [
        { 'members.userId': 'dbuser-1' },
        { gameMasterId: 'dbuser-1', members: { $in: [null, []] } },
        { gameMasterId: 'dbuser-1' },
      ],
    })
    expect(result).toHaveLength(1)
    expect((result[0] as { id: string }).id).toBe('camp-1')
  })

  it('returns empty array when user is not found in DB', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null)

    const result = await _listCampaigns()

    expect(result).toEqual([])
  })

  it('returns empty array when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    const result = await _listCampaigns()

    expect(result).toEqual([])
  })

  it('sets isMember true for returned campaigns', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.find).mockReturnValue({ sort: vi.fn().mockResolvedValue([campaign]) } as never)

    const result = await _listCampaigns()

    expect((result[0] as { isMember: boolean }).isMember).toBe(true)
  })

  it('redacts invite code for non-owner members', async () => {
    const campaign = makeCampaign({ gameMasterId: 'someone-else', members: [{ userId: 'dbuser-1', role: 'player' }] })
    vi.mocked(Campaign.find).mockReturnValue({ sort: vi.fn().mockResolvedValue([campaign]) } as never)

    const result = await _listCampaigns()

    expect((result[0] as { inviteCode: string }).inviteCode).toBe('')
    expect((result[0] as { isOwner: boolean }).isOwner).toBe(false)
  })

  it('shows invite code to owners', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.find).mockReturnValue({ sort: vi.fn().mockResolvedValue([campaign]) } as never)

    const result = await _listCampaigns()

    expect((result[0] as { inviteCode: string }).inviteCode).toBe('ABCD-EFGH')
    expect((result[0] as { isOwner: boolean }).isOwner).toBe(true)
  })

  it('reflects real player count (excluding GM)', async () => {
    const campaign = makeCampaign({
      members: [
        { userId: 'dbuser-1', role: 'gm' },
        { userId: 'player-1', role: 'player' },
        { userId: 'player-2', role: 'player' },
      ],
    })
    vi.mocked(Campaign.find).mockReturnValue({ sort: vi.fn().mockResolvedValue([campaign]) } as never)

    const result = await _listCampaigns()

    expect((result[0] as { players: { current: number } }).players.current).toBe(2)
  })
})

describe('getCampaign', () => {
  it('returns campaign for a member', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect(result).not.toBeNull()
    expect((result as { id: string }).id).toBe('camp-1')
  })

  it('returns null for non-members', async () => {
    const campaign = makeCampaign({ gameMasterId: 'someone-else', members: [{ userId: 'someone-else', role: 'gm' }] })
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect(result).toBeNull()
  })

  it('returns null when campaign does not exist', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue(null)

    const result = await _getCampaign({ data: { id: 'nonexistent' } })

    expect(result).toBeNull()
  })

  it('sets isMember true for members', async () => {
    const campaign = makeCampaign()
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect((result as { isMember: boolean }).isMember).toBe(true)
  })

  it('redacts invite code for player members (non-owners)', async () => {
    const campaign = makeCampaign({ gameMasterId: 'someone-else', members: [{ userId: 'dbuser-1', role: 'player' }] })
    vi.mocked(Campaign.findById).mockResolvedValue(campaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect((result as { inviteCode: string }).inviteCode).toBe('')
  })
})

describe('legacy campaigns (no members array)', () => {
  it('listCampaigns includes legacy campaigns where user is the GM', async () => {
    const legacyCampaign = makeCampaign({ members: undefined })
    // The query uses $or, so legacy campaigns with gameMasterId match
    const mockSort = vi.fn().mockResolvedValue([legacyCampaign])
    vi.mocked(Campaign.find).mockReturnValue({ sort: mockSort } as never)

    const result = await _listCampaigns()

    expect(Campaign.find).toHaveBeenCalledWith({
      $or: [
        { 'members.userId': 'dbuser-1' },
        { gameMasterId: 'dbuser-1', members: { $in: [null, []] } },
        { gameMasterId: 'dbuser-1' },
      ],
    })
    expect(result).toHaveLength(1)
  })

  it('getCampaign returns campaign for GM even without members array', async () => {
    const legacyCampaign = makeCampaign({ members: undefined })
    vi.mocked(Campaign.findById).mockResolvedValue(legacyCampaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect(result).not.toBeNull()
    expect((result as { id: string }).id).toBe('camp-1')
    expect((result as { isOwner: boolean }).isOwner).toBe(true)
  })

  it('getCampaign returns null for non-GM on legacy campaign without members', async () => {
    const legacyCampaign = makeCampaign({ gameMasterId: 'someone-else', members: undefined })
    vi.mocked(Campaign.findById).mockResolvedValue(legacyCampaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect(result).toBeNull()
  })

  it('getCampaign returns campaign for GM on legacy campaign with empty members array', async () => {
    const legacyCampaign = makeCampaign({ members: [] })
    vi.mocked(Campaign.findById).mockResolvedValue(legacyCampaign)

    const result = await _getCampaign({ data: { id: 'camp-1' } })

    expect(result).not.toBeNull()
    expect((result as { isOwner: boolean }).isOwner).toBe(true)
  })
})

describe('createCampaign', () => {
  it('auto-adds GM as a member with role gm', async () => {
    vi.mocked(Campaign.exists).mockResolvedValue(null)
    const created = makeCampaign()
    vi.mocked(Campaign.create).mockResolvedValue(created as never)

    await _createCampaign({ data: { name: 'My Campaign', description: '' } })

    const createCall = vi.mocked(Campaign.create).mock.calls[0][0] as { members: Array<{ role: string }> }
    expect(createCall.members).toHaveLength(1)
    expect(createCall.members[0].role).toBe('gm')
  })

  it('syncs User.campaigns after creation', async () => {
    vi.mocked(Campaign.exists).mockResolvedValue(null)
    vi.mocked(Campaign.create).mockResolvedValue(makeCampaign() as never)

    await _createCampaign({ data: { name: 'My Campaign', description: '' } })

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'dbuser-1' },
      expect.objectContaining({ $push: expect.objectContaining({ campaigns: expect.any(Object) }) })
    )
  })

  it('fires campaign_created analytics event on success', async () => {
    vi.mocked(Campaign.exists).mockResolvedValue(null)
    vi.mocked(Campaign.create).mockResolvedValue({ ...makeCampaign(), name: 'My Campaign' } as never)

    await _createCampaign({ data: { name: 'My Campaign', description: '' } })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'campaign_created', {
      campaign_id: 'camp-1',
      campaign_name: 'My Campaign',
      has_image: false,
      has_schedule: false,
    })
  })

  it('does not fire analytics when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _createCampaign({ data: { name: 'Test', description: '' } })
    ).rejects.toThrow('Not authenticated')

    expect(serverCaptureEvent).not.toHaveBeenCalled()
  })
})

describe('joinCampaign', () => {
  it('adds user as player member with a valid invite code', async () => {
    const campaignDoc = makeCampaign({ gameMasterId: 'gm-user', members: [{ userId: 'gm-user', role: 'gm' }] })
    vi.mocked(Campaign.findOne).mockResolvedValue(campaignDoc)
    const updatedDoc = { ...campaignDoc, members: [...campaignDoc.members, { userId: 'dbuser-1', role: 'player' }] }
    vi.mocked(Campaign.findOneAndUpdate).mockResolvedValue(updatedDoc)

    const result = await _joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })

    expect(result).toMatchObject({ success: true, campaignId: 'camp-1' })
    expect(Campaign.findOneAndUpdate).toHaveBeenCalled()
    expect(User.updateOne).toHaveBeenCalled()
  })

  it('throws for invalid invite code', async () => {
    vi.mocked(Campaign.findOne).mockResolvedValue(null)

    await expect(_joinCampaign({ data: { inviteCode: 'XXXX-XXXX' } })).rejects.toThrow('Invalid invite code')
  })

  it('throws when already a member', async () => {
    const campaignDoc = makeCampaign({ members: [{ userId: 'dbuser-1', role: 'player' }] })
    vi.mocked(Campaign.findOne).mockResolvedValue(campaignDoc)

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow('Already a member')
  })

  it('throws when campaign is full (findOneAndUpdate returns null)', async () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ userId: `player-${i}`, role: 'player' }))
    const campaignDoc = makeCampaign({ gameMasterId: 'gm-user', maxPlayers: 4, members: [{ userId: 'gm-user', role: 'gm' }, ...players] })
    vi.mocked(Campaign.findOne).mockResolvedValue(campaignDoc)
    // findOneAndUpdate returns null when capacity check fails
    vi.mocked(Campaign.findOneAndUpdate).mockResolvedValue(null)

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow('Campaign is full')
  })

  it('throws when campaign is not active', async () => {
    const campaignDoc = makeCampaign({ status: 'paused', members: [{ userId: 'gm-user', role: 'gm' }] })
    vi.mocked(Campaign.findOne).mockResolvedValue(campaignDoc)

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow('Campaign is not active')
  })

  it('fires campaign_joined analytics event on success', async () => {
    const campaignDoc = makeCampaign({ gameMasterId: 'gm-user', members: [{ userId: 'gm-user', role: 'gm' }] })
    vi.mocked(Campaign.findOne).mockResolvedValue(campaignDoc)
    const updatedDoc = { ...campaignDoc, members: [...campaignDoc.members, { userId: 'dbuser-1', role: 'player' }] }
    vi.mocked(Campaign.findOneAndUpdate).mockResolvedValue(updatedDoc)

    await _joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'campaign_joined', { campaign_id: 'camp-1' })
  })
})

describe('updateCampaign', () => {
  it('fires campaign_updated analytics event on success', async () => {
    const campaign = makeCampaign()
    const saveMock = vi.fn().mockResolvedValue(campaign)
    vi.mocked(Campaign.findById).mockResolvedValue({ ...campaign, save: saveMock } as never)

    await _updateCampaign({
      data: { id: 'camp-1', name: 'Updated Name', description: '' },
    })

    expect(serverCaptureEvent).toHaveBeenCalledWith('session-user-1', 'campaign_updated', { campaign_id: 'camp-1' })
  })

  it('does not fire analytics on auth failure', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    await expect(
      _updateCampaign({ data: { id: 'camp-1', name: 'Test', description: '' } })
    ).rejects.toThrow('Not authenticated')

    expect(serverCaptureEvent).not.toHaveBeenCalled()
  })

  it('does not fire analytics when campaign not found', async () => {
    vi.mocked(Campaign.findById).mockResolvedValue(null)

    await expect(
      _updateCampaign({ data: { id: 'nonexistent', name: 'Test', description: '' } })
    ).rejects.toThrow('Campaign not found')

    expect(serverCaptureEvent).not.toHaveBeenCalled()
  })
})
