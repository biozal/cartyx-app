import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests for campaign utility functions (not requiring DB)
import { generateInviteCode, validateUrl, parseMaxPlayers } from '~/server/utils/helpers';

describe('generateInviteCode', () => {
  it('returns a string in XXXX-XXXX format', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});

describe('validateUrl', () => {
  it('returns null for empty/undefined input', () => {
    expect(validateUrl(null)).toBe(null);
    expect(validateUrl(undefined)).toBe(null);
    expect(validateUrl('')).toBe(null);
    expect(validateUrl('   ')).toBe(null);
  });

  it('returns false for non-http/https URLs', () => {
    expect(validateUrl('ftp://example.com')).toBe(false);
    expect(validateUrl('javascript:alert(1)')).toBe(false);
    expect(validateUrl('not-a-url')).toBe(false);
  });

  it('returns normalized URL for valid http/https', () => {
    expect(validateUrl('https://example.com')).toBe('https://example.com/');
    expect(validateUrl('http://discord.gg/test')).toBe('http://discord.gg/test');
    expect(validateUrl('  https://example.com  ')).toBe('https://example.com/');
  });
});

describe('parseMaxPlayers', () => {
  it('clamps values between 1 and 10', () => {
    expect(parseMaxPlayers(0)).toBe(1);
    expect(parseMaxPlayers(-5)).toBe(1);
    expect(parseMaxPlayers(11)).toBe(10);
    expect(parseMaxPlayers(100)).toBe(10);
  });

  it('returns parsed value for valid input', () => {
    expect(parseMaxPlayers(4)).toBe(4);
    expect(parseMaxPlayers('6')).toBe(6);
    expect(parseMaxPlayers(1)).toBe(1);
    expect(parseMaxPlayers(10)).toBe(10);
  });

  it('defaults to 4 for undefined, clamps NaN to 1', () => {
    expect(parseMaxPlayers(undefined)).toBe(4);
    expect(parseMaxPlayers('abc')).toBe(1); // parseInt('abc') = NaN → clamps to min 1
  });
});

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
}));

vi.mock('~/server/session', () => ({ getSession: vi.fn() }));
vi.mock('~/server/db/connection', () => ({
  connectDB: vi.fn(),
  isDBConnected: vi.fn(() => true),
}));
vi.mock('~/server/repositories/identity', () => import('./identityTestDouble'));
vi.mock('~/server/repositories/campaigns', () => import('./campaignsTestDouble'));
vi.mock('~/server/db/models/Player', () => ({
  Player: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    create: vi.fn(),
    updateOne: vi.fn(),
  },
}));
vi.mock('~/server/db/models/Session', () => ({
  Session: {
    find: vi
      .fn()
      .mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    findOne: vi.fn().mockReturnValue({ session: vi.fn().mockReturnValue(null) }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    create: vi.fn(),
  },
}));
vi.mock('~/server/db/models/GMScreen', () => ({
  GMScreen: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    create: vi.fn(),
  },
}));

vi.mock('~/server/functions/srdImport', () => ({
  importSrdContent: vi.fn().mockResolvedValue({ spells: 339, races: 9, rules: 104 }),
}));

const mockMongoSession = {
  withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  endSession: vi.fn(),
};
vi.mock('mongoose', async () => {
  const actual = await vi.importActual<typeof import('mongoose')>('mongoose');
  return { default: { startSession: vi.fn(() => mockMongoSession), Types: actual.default.Types } };
});

import mongoose from 'mongoose';

import { getSession } from '~/server/session';
import { resetIdentityDouble } from './identityTestDouble';
import {
  applyUpdatesToGet,
  campaigns as campaignsDouble,
  InviteCodeTakenError,
  newObjectId,
} from './campaignsTestDouble';
import { Player } from '~/server/db/models/Player';
import { Session } from '~/server/db/models/Session';
import { GMScreen } from '~/server/db/models/GMScreen';
import { importSrdContent } from '~/server/functions/srdImport';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  joinCampaign,
  activateSession,
  campaignInputSchema,
} from '~/server/functions/campaigns';

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
};
const mockDbUser = { id: 'dbuser-1', firstName: 'Test', lastName: 'User' };

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'camp-1',
    gameMasterId: 'dbuser-1',
    name: 'Test Campaign',
    description: '',
    status: 'active',
    inviteCode: 'ABCD-EFGH',
    imagePath: null,
    links: [],
    maxPlayers: 4,
    schedule: null,
    members: [{ userId: 'dbuser-1', role: 'gm' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(mockSession);
  resetIdentityDouble(mockDbUser);
  vi.mocked(Player.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as never);
  vi.mocked(Player.create).mockResolvedValue({} as never);
  vi.mocked(Player.updateOne).mockResolvedValue({} as never);
  vi.mocked(Session.find).mockReturnValue({
    sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
  } as never);
  vi.mocked(Session.create).mockResolvedValue([] as never);
  vi.mocked(Session.findOne).mockReturnValue({
    session: vi.fn().mockReturnValue(null),
    lean: vi.fn().mockResolvedValue(null),
  } as never);
  vi.mocked(Session.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
  vi.mocked(GMScreen.find).mockReturnValue({ lean: vi.fn().mockResolvedValue([]) } as never);
  vi.mocked(GMScreen.create).mockResolvedValue([] as never);
  // The function mints the campaign id; pin it so assertions can name it.
  newObjectId.mockReturnValue('camp-1');
  campaignsDouble.create.mockImplementation(async (document) => document);
  mockMongoSession.withTransaction.mockImplementation(async (fn: () => Promise<void>) => fn());
  mockMongoSession.endSession.mockReset();
});

// Cast server functions to callable handler signatures
const _listCampaigns = listCampaigns as unknown as () => Promise<unknown[]>;
const _getCampaign = getCampaign as unknown as (args: { data: { id: string } }) => Promise<unknown>;
const _createCampaign = createCampaign as unknown as (args: {
  data: Record<string, unknown>;
}) => Promise<unknown>;
const _updateCampaign = updateCampaign as unknown as (args: {
  data: Record<string, unknown>;
}) => Promise<unknown>;
const _joinCampaign = joinCampaign as unknown as (args: {
  data: { inviteCode: string };
}) => Promise<unknown>;
const _activateSession = activateSession as unknown as (args: {
  data: { campaignId: string; sessionId: string; endDate?: string };
}) => Promise<unknown>;

describe('listCampaigns', () => {
  it('returns only campaigns where the user is a member', async () => {
    const campaign = makeCampaign();
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    // Which campaigns count as the user's — members, the GM of legacy campaigns with no
    // members list, the GM of campaigns whose list omits them — is the repository's
    // job, and is tested there against the in-memory store.
    expect(campaignsDouble.listForUser).toHaveBeenCalledWith('dbuser-1');
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe('camp-1');
  });

  it('returns empty array when user is not found in DB', async () => {
    resetIdentityDouble(null);

    const result = await _listCampaigns();

    expect(result).toEqual([]);
  });

  it('returns empty array when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await _listCampaigns();

    expect(result).toEqual([]);
  });

  it('sets isMember true for returned campaigns', async () => {
    const campaign = makeCampaign();
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    expect((result[0] as { isMember: boolean }).isMember).toBe(true);
  });

  it('redacts invite code for non-owner members', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'someone-else',
      members: [{ userId: 'dbuser-1', role: 'player' }],
    });
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    expect((result[0] as { inviteCode: string }).inviteCode).toBe('');
    expect((result[0] as { isOwner: boolean }).isOwner).toBe(false);
  });

  it('shows invite code to owners', async () => {
    const campaign = makeCampaign();
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    expect((result[0] as { inviteCode: string }).inviteCode).toBe('ABCD-EFGH');
    expect((result[0] as { isOwner: boolean }).isOwner).toBe(true);
  });

  it('reflects real player count (excluding GM)', async () => {
    const campaign = makeCampaign({
      members: [
        { userId: 'dbuser-1', role: 'gm' },
        { userId: 'player-1', role: 'player' },
        { userId: 'player-2', role: 'player' },
      ],
    });
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    expect((result[0] as { players: { current: number } }).players.current).toBe(2);
  });

  it('includes partyMembers in returned campaigns', async () => {
    const campaign = makeCampaign();
    campaignsDouble.listForUser.mockResolvedValue([campaign]);
    vi.mocked(Player.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'p-1',
          campaignId: 'camp-1',
          createdBy: 'dbuser-2',
          firstName: 'Aragorn',
          lastName: '',
          characterClass: 'Ranger',
          picture: null,
        },
      ]),
    } as never);

    const result = await _listCampaigns();

    expect((result[0]! as { partyMembers: unknown[] }).partyMembers).toHaveLength(1);
    expect(
      (result[0]! as { partyMembers: Array<{ characterName: string }> }).partyMembers[0]!
        .characterName
    ).toBe('Aragorn');
  });

  it('includes links in returned campaigns', async () => {
    const campaign = makeCampaign({ links: [{ name: 'Discord', url: 'https://discord.gg/test' }] });
    campaignsDouble.listForUser.mockResolvedValue([campaign]);

    const result = await _listCampaigns();

    expect((result[0]! as { links: Array<{ name: string }> }).links[0]!.name).toBe('Discord');
  });
});

describe('getCampaign', () => {
  it('returns campaign for a member', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(result).not.toBeNull();
    expect((result as { id: string }).id).toBe('camp-1');
  });

  it('returns null for non-members', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'someone-else',
      members: [{ userId: 'someone-else', role: 'gm' }],
    });
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(result).toBeNull();
  });

  it('returns null when campaign does not exist', async () => {
    campaignsDouble.get.mockResolvedValue(null);

    const result = await _getCampaign({ data: { id: 'nonexistent' } });

    expect(result).toBeNull();
  });

  it('sets isMember true for members', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect((result as { isMember: boolean }).isMember).toBe(true);
  });

  it('redacts invite code for player members (non-owners)', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'someone-else',
      members: [{ userId: 'dbuser-1', role: 'player' }],
    });
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect((result as { inviteCode: string }).inviteCode).toBe('');
  });

  it('includes partyMembers from Player collection', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    vi.mocked(Player.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'p-1',
          campaignId: 'camp-1',
          createdBy: 'dbuser-2',
          firstName: 'Gandalf',
          lastName: '',
          characterClass: 'Wizard',
          picture: null,
        },
      ]),
    } as never);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(
      (result as { partyMembers: Array<{ characterName: string }> }).partyMembers[0]!.characterName
    ).toBe('Gandalf');
  });

  it('loads sessions for any user entering the campaign', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'someone-else',
      members: [{ userId: 'dbuser-1', role: 'player' }],
    });
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockSessionDocs = [
      {
        _id: 'sess-1',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockSessionDocs) }),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{ name: string }>;
    };

    expect(Session.find).toHaveBeenCalledWith(
      { campaignId: 'camp-1' },
      '_id name number startDate endDate status'
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.name).toBe('Session 0');
  });

  it('loads gmScreens only for GM (campaign owner)', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockGmScreenDocs = [{ _id: 'gms-1', name: 'Default' }];
    vi.mocked(GMScreen.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockGmScreenDocs),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      gmScreens?: Array<{ name: string }>;
    };

    expect(GMScreen.find).toHaveBeenCalledWith({ campaignId: 'camp-1' }, '_id name');
    expect(result.gmScreens).toHaveLength(1);
    expect(result.gmScreens![0]!.name).toBe('Default');
  });

  it('does not load gmScreens for non-GM users', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'someone-else',
      members: [{ userId: 'dbuser-1', role: 'player' }],
    });
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as { gmScreens?: unknown[] };

    expect(GMScreen.find).not.toHaveBeenCalled();
    expect(result.gmScreens).toBeUndefined();
  });
});

describe('legacy campaigns (no members array)', () => {
  it('listCampaigns includes legacy campaigns where user is the GM', async () => {
    const legacyCampaign = makeCampaign({ members: undefined });
    // The repository includes legacy campaigns the user runs; see its tests.
    campaignsDouble.listForUser.mockResolvedValue([legacyCampaign]);

    const result = await _listCampaigns();

    expect(campaignsDouble.listForUser).toHaveBeenCalledWith('dbuser-1');
    expect(result).toHaveLength(1);
  });

  it('getCampaign returns campaign for GM even without members array', async () => {
    const legacyCampaign = makeCampaign({ members: undefined });
    campaignsDouble.get.mockResolvedValue(legacyCampaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(result).not.toBeNull();
    expect((result as { id: string }).id).toBe('camp-1');
    expect((result as { isOwner: boolean }).isOwner).toBe(true);
  });

  it('getCampaign returns null for non-GM on legacy campaign without members', async () => {
    const legacyCampaign = makeCampaign({ gameMasterId: 'someone-else', members: undefined });
    campaignsDouble.get.mockResolvedValue(legacyCampaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(result).toBeNull();
  });

  it('getCampaign returns campaign for GM on legacy campaign with empty members array', async () => {
    const legacyCampaign = makeCampaign({ members: [] });
    campaignsDouble.get.mockResolvedValue(legacyCampaign);

    const result = await _getCampaign({ data: { id: 'camp-1' } });

    expect(result).not.toBeNull();
    expect((result as { isOwner: boolean }).isOwner).toBe(true);
  });
});

describe('createCampaign', () => {
  it('auto-adds GM as a member with role gm', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(campaignsDouble.create).toHaveBeenCalledTimes(1);
    const createCall = campaignsDouble.create.mock.calls[0]![0] as unknown as {
      members: Array<{ role: string }>;
    };
    expect(createCall.members).toHaveLength(1);
    expect(createCall.members[0]!.role).toBe('gm');
  });

  it('stores links on the campaign', async () => {
    await _createCampaign({
      data: {
        name: 'My Campaign',
        description: '',
        links: [{ name: 'Discord', url: 'https://discord.gg/test' }],
      },
    });

    expect(campaignsDouble.create).toHaveBeenCalledTimes(1);
    const createCall = campaignsDouble.create.mock.calls[0]![0] as unknown as {
      links: Array<{ name: string; url: string }>;
    };
    expect(createCall.links).toEqual([{ name: 'Discord', url: 'https://discord.gg/test' }]);
  });

  it('imports SRD content into the new campaign when loadSrdData is true', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '', loadSrdData: true } });

    expect(importSrdContent).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'camp-1',
        gmId: 'dbuser-1',
        session: expect.anything(),
      })
    );
  });

  it('does not import SRD content when loadSrdData is false or omitted', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '', loadSrdData: false } });
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(importSrdContent).not.toHaveBeenCalled();
  });

  it('throws when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(_createCampaign({ data: { name: 'Test', description: '' } })).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('creates a default Session 0 document for the new campaign', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          campaignId: 'camp-1',
          name: 'Session 0',
          gm: 'dbuser-1',
          number: 0,
          endDate: null,
        }),
      ],
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('creates Session 0 with status set to active', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          campaignId: 'camp-1',
          name: 'Session 0',
          status: 'active',
        }),
      ],
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('creates a default GMScreen document for the new campaign', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(GMScreen.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          campaignId: 'camp-1',
          name: 'General',
          tabOrder: 0,
          createdBy: 'dbuser-1',
        }),
      ],
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('opens no MongoDB session when the campaign itself cannot be written', async () => {
    campaignsDouble.create.mockRejectedValue(new Error('DB write failed'));

    await expect(_createCampaign({ data: { name: 'Fail', description: '' } })).rejects.toThrow();

    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(campaignsDouble.remove).not.toHaveBeenCalled();
  });

  it('removes the campaign again when its Session 0 or GM screen cannot be created', async () => {
    vi.mocked(Session.create).mockRejectedValue(new Error('Session write failed'));

    await expect(
      _createCampaign({ data: { name: 'My Campaign', description: '' } })
    ).rejects.toThrow('Session write failed');

    // Nothing may be left behind: a campaign with no Session 0 or GM screen is broken.
    expect(campaignsDouble.remove).toHaveBeenCalledWith('camp-1');
    expect(mockMongoSession.endSession).toHaveBeenCalled();
  });

  it('rolls back all writes when Session.create fails inside transaction', async () => {
    vi.mocked(Session.create).mockRejectedValue(new Error('Session write failed'));

    await expect(
      _createCampaign({ data: { name: 'My Campaign', description: '' } })
    ).rejects.toThrow('Session write failed');

    expect(Session.create).toHaveBeenCalled();
    expect(mockMongoSession.endSession).toHaveBeenCalled();
  });

  it('rolls back all writes when the GM screen fails inside transaction', async () => {
    vi.mocked(GMScreen.create).mockRejectedValue(new Error('GM screen write failed'));

    await expect(
      _createCampaign({ data: { name: 'My Campaign', description: '' } })
    ).rejects.toThrow('GM screen write failed');

    expect(campaignsDouble.create).toHaveBeenCalled();
    expect(Session.create).toHaveBeenCalled();
    expect(GMScreen.create).toHaveBeenCalled();
    expect(mockMongoSession.endSession).toHaveBeenCalled();
  });
});

describe('joinCampaign', () => {
  beforeEach(() => {
    resetIdentityDouble({ ...mockDbUser, id: '507f1f77bcf86cd799439011' });
  });
  it('adds user as player member with a valid invite code', async () => {
    const campaignDoc = makeCampaign({
      gameMasterId: 'gm-user',
      members: [{ userId: 'gm-user', role: 'gm' }],
    });
    campaignsDouble.findByInviteCode.mockResolvedValue(campaignDoc as never);
    const updatedDoc = {
      ...campaignDoc,
      members: [...campaignDoc.members, { userId: '507f1f77bcf86cd799439011', role: 'player' }],
    };
    campaignsDouble.addPlayer.mockResolvedValue({
      outcome: 'joined',
      campaign: updatedDoc as never,
    });

    const result = await _joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } });

    expect(result).toMatchObject({ success: true, campaignId: 'camp-1' });
    expect(campaignsDouble.addPlayer).toHaveBeenCalledWith(
      'camp-1',
      '507f1f77bcf86cd799439011',
      expect.any(Date)
    );
  });

  it('creates a Player document with placeholder info on join', async () => {
    const campaignDoc = makeCampaign({
      gameMasterId: 'gm-user',
      members: [{ userId: 'gm-user', role: 'gm' }],
    });
    campaignsDouble.findByInviteCode.mockResolvedValue(campaignDoc as never);
    const updatedDoc = {
      ...campaignDoc,
      members: [...campaignDoc.members, { userId: '507f1f77bcf86cd799439011', role: 'player' }],
    };
    campaignsDouble.addPlayer.mockResolvedValue({
      outcome: 'joined',
      campaign: updatedDoc as never,
    });

    await _joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } });

    expect(Player.updateOne).toHaveBeenCalledWith(
      { campaignId: 'camp-1', userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011') },
      {
        $setOnInsert: expect.objectContaining({
          campaignId: 'camp-1',
          userId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
          characterClass: 'Adventurer',
        }),
      },
      { upsert: true }
    );
  });

  it('throws for invalid invite code', async () => {
    campaignsDouble.findByInviteCode.mockResolvedValue(null);

    await expect(_joinCampaign({ data: { inviteCode: 'XXXX-XXXX' } })).rejects.toThrow(
      'Invalid invite code'
    );
  });

  it('throws when already a member', async () => {
    const campaignDoc = makeCampaign({
      members: [{ userId: '507f1f77bcf86cd799439011', role: 'player' }],
    });
    campaignsDouble.findByInviteCode.mockResolvedValue(campaignDoc as never);

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow(
      'Already a member'
    );
  });

  it('throws when campaign is full', async () => {
    const players = Array.from({ length: 4 }, (_, i) => ({
      userId: `player-${i}`,
      role: 'player',
    }));
    const campaignDoc = makeCampaign({
      gameMasterId: 'gm-user',
      maxPlayers: 4,
      members: [{ userId: 'gm-user', role: 'gm' }, ...players],
    });
    campaignsDouble.findByInviteCode.mockResolvedValue(campaignDoc as never);
    // The compare-and-set refuses the join when there is no seat left.
    campaignsDouble.addPlayer.mockResolvedValue({
      outcome: 'full',
      campaign: campaignDoc as never,
    });

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow(
      'Campaign is full'
    );
  });

  it('throws when campaign is not active', async () => {
    const campaignDoc = makeCampaign({
      status: 'paused',
      members: [{ userId: 'gm-user', role: 'gm' }],
    });
    campaignsDouble.findByInviteCode.mockResolvedValue(campaignDoc as never);

    await expect(_joinCampaign({ data: { inviteCode: 'ABCD-EFGH' } })).rejects.toThrow(
      'Campaign is not active'
    );
  });
});

describe('updateCampaign', () => {
  it('stores updated links on the campaign', async () => {
    campaignsDouble.get.mockResolvedValue(makeCampaign());
    applyUpdatesToGet();

    await _updateCampaign({
      data: {
        id: 'camp-1',
        name: 'Updated Name',
        description: '',
        links: [{ name: 'D&D Beyond', url: 'https://dndbeyond.com' }],
      },
    });

    const updated = await campaignsDouble.update.mock.results[0]!.value;
    expect(updated.links).toEqual([{ name: 'D&D Beyond', url: 'https://dndbeyond.com' }]);
    expect(updated.name).toBe('Updated Name');
  });

  it('throws when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      _updateCampaign({ data: { id: 'camp-1', name: 'Test', description: '' } })
    ).rejects.toThrow('Not authenticated');
  });

  it('throws when campaign not found', async () => {
    campaignsDouble.get.mockResolvedValue(null);

    await expect(
      _updateCampaign({ data: { id: 'nonexistent', name: 'Test', description: '' } })
    ).rejects.toThrow('Campaign not found');
  });
});

// ---------------------------------------------------------------------------
// campaignInputSchema — imagePath refinement
// ---------------------------------------------------------------------------

describe('campaignInputSchema', () => {
  it('accepts imagePath alone (direct upload)', () => {
    const result = campaignInputSchema.safeParse({
      name: 'test',
      imagePath: 'https://cdn.example.com/uploads/campaigns/img.webp',
    });
    expect(result.success).toBe(true);
  });

  it('accepts imageData fields alone (base64 fallback)', () => {
    const result = campaignInputSchema.safeParse({
      name: 'test',
      imageData: 'a'.repeat(100),
      imageMime: 'image/webp',
      imageName: 'img.webp',
    });
    expect(result.success).toBe(true);
  });

  it('rejects both imagePath and imageData together', () => {
    const result = campaignInputSchema.safeParse({
      name: 'test',
      imagePath: 'https://cdn.example.com/uploads/campaigns/img.webp',
      imageData: 'base64data',
      imageMime: 'image/webp',
      imageName: 'img.webp',
    });
    expect(result.success).toBe(false);
  });

  it('accepts neither imagePath nor imageData (no image)', () => {
    const result = campaignInputSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(true);
  });

  it('accepts a links array', () => {
    const result = campaignInputSchema.safeParse({
      name: 'test',
      links: [{ name: 'Discord', url: 'https://discord.gg/test' }],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCampaign — imagePath (direct R2 upload)
// ---------------------------------------------------------------------------

describe('createCampaign with imagePath (direct R2 upload)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CDN_URL = 'https://cdn.example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts imagePath and stores it on the campaign', async () => {
    await _createCampaign({
      data: {
        name: 'My Campaign',
        description: '',
        imagePath: 'https://cdn.example.com/uploads/campaigns/img.webp',
      },
    });

    expect(campaignsDouble.create).toHaveBeenCalledTimes(1);
    const createCall = campaignsDouble.create.mock.calls[0]![0] as unknown as { imagePath: string };
    expect(createCall.imagePath).toBe('https://cdn.example.com/uploads/campaigns/img.webp');
  });

  it('throws when imagePath origin does not match CDN_URL', async () => {
    await expect(
      _createCampaign({
        data: {
          name: 'My Campaign',
          description: '',
          imagePath: 'https://evil.com/malicious.jpg',
        },
      })
    ).rejects.toThrow('Invalid image path');
  });

  it('throws when CDN_URL is not set but imagePath is provided', async () => {
    delete process.env.CDN_URL;

    await expect(
      _createCampaign({
        data: {
          name: 'My Campaign',
          description: '',
          imagePath: 'https://cdn.example.com/uploads/campaigns/img.webp',
        },
      })
    ).rejects.toThrow('Invalid image path');
  });
});

// ---------------------------------------------------------------------------
// updateCampaign — imagePath (direct R2 upload)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Regression: default doc creation (#302)
// ---------------------------------------------------------------------------

describe('createCampaign — default document creation regression (#302)', () => {
  beforeEach(() => {});

  it('creates exactly one Session 0 and exactly one GMScreen per campaign', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    expect(GMScreen.create).toHaveBeenCalledTimes(1);
  });

  it('Session 0 has name "Session 0" and gm set to the campaign owner', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    const sessionCreateCall = vi.mocked(Session.create).mock.calls[0]![0] as Array<{
      name: string;
      gm: string;
    }>;
    expect(sessionCreateCall[0]!.name).toBe('Session 0');
    expect(sessionCreateCall[0]!.gm).toBe('dbuser-1');
  });

  it('Session 0 has a startDate set to a Date value', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    const sessionCreateCall = vi.mocked(Session.create).mock.calls[0]![0] as Array<{
      startDate: unknown;
      endDate: unknown;
    }>;
    expect(sessionCreateCall[0]!.startDate).toBeInstanceOf(Date);
  });

  it('Session 0 has endDate explicitly set to null', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    const sessionCreateCall = vi.mocked(Session.create).mock.calls[0]![0] as Array<{
      endDate: unknown;
    }>;
    expect(sessionCreateCall[0]!.endDate).toBeNull();
  });

  it('Session 0 has number 0, not 1', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    const sessionCreateCall = vi.mocked(Session.create).mock.calls[0]![0] as Array<{
      number: number;
    }>;
    expect(sessionCreateCall[0]!.number).toBe(0);
  });

  it('GMScreen default name is "General" with createdBy and tabOrder', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(GMScreen.create).toHaveBeenCalledTimes(1);
    const gmCreateCall = vi.mocked(GMScreen.create).mock.calls[0]![0] as Array<{
      name: string;
      tabOrder: number;
      createdBy: string;
    }>;
    expect(gmCreateCall[0]!.name).toBe('General');
    expect(gmCreateCall[0]!.tabOrder).toBe(0);
    expect(gmCreateCall[0]!.createdBy).toBe('dbuser-1');
  });

  it('does not create Session 0 or GMScreen when the campaign cannot be written', async () => {
    campaignsDouble.create.mockRejectedValue(new Error('DB write failed'));

    await expect(_createCampaign({ data: { name: 'Fail', description: '' } })).rejects.toThrow();

    expect(Session.create).not.toHaveBeenCalled();
    expect(GMScreen.create).not.toHaveBeenCalled();
  });

  it('retries with a fresh invite code when one is taken, creating defaults once', async () => {
    campaignsDouble.create
      .mockRejectedValueOnce(new InviteCodeTakenError())
      .mockImplementationOnce(async (document) => document);

    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(campaignsDouble.create).toHaveBeenCalledTimes(2);
    const [first, second] = campaignsDouble.create.mock.calls.map(
      ([document]) => (document as { inviteCode: string }).inviteCode
    );
    expect(first).not.toBe(second);
    // Defaults are still created exactly once — only after the successful attempt
    expect(Session.create).toHaveBeenCalledTimes(1);
    expect(GMScreen.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after ten taken invite codes without creating defaults', async () => {
    campaignsDouble.create.mockRejectedValue(new InviteCodeTakenError());

    await expect(
      _createCampaign({ data: { name: 'My Campaign', description: '' } })
    ).rejects.toThrow('Could not generate unique invite code');

    expect(campaignsDouble.create).toHaveBeenCalledTimes(10);
    expect(Session.create).not.toHaveBeenCalled();
  });

  it('both defaults use the same campaignId', async () => {
    newObjectId.mockReturnValue('new-camp-id');

    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    expect(GMScreen.create).toHaveBeenCalledTimes(1);
    const sessionCall = vi.mocked(Session.create).mock.calls[0]![0] as Array<{
      campaignId: string;
    }>;
    const gmCall = vi.mocked(GMScreen.create).mock.calls[0]![0] as Array<{ campaignId: string }>;
    expect(sessionCall[0]!.campaignId).toBe('new-camp-id');
    expect(gmCall[0]!.campaignId).toBe('new-camp-id');
  });

  it('both defaults are created within the same mongo transaction session', async () => {
    await _createCampaign({ data: { name: 'My Campaign', description: '' } });

    expect(Session.create).toHaveBeenCalledTimes(1);
    expect(GMScreen.create).toHaveBeenCalledTimes(1);
    const sessionOpts = vi.mocked(Session.create).mock.calls[0]![1] as { session: unknown };
    const gmOpts = vi.mocked(GMScreen.create).mock.calls[0]![1] as { session: unknown };
    expect(sessionOpts.session).toBeDefined();
    expect(gmOpts.session).toBeDefined();
    expect(sessionOpts.session).toBe(gmOpts.session);
  });
});

// ---------------------------------------------------------------------------
// Regression: enter-campaign loading (#302)
// ---------------------------------------------------------------------------

describe('getCampaign — enter-campaign loading regression (#302)', () => {
  it('returns multiple sessions sorted by number', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const sessionDocs = [
      {
        _id: 'sess-0',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
      {
        _id: 'sess-1',
        name: 'Session 1',
        number: 1,
        startDate: new Date('2026-01-08'),
        endDate: new Date('2026-01-08T23:00:00Z'),
      },
      {
        _id: 'sess-2',
        name: 'Session 2',
        number: 2,
        startDate: new Date('2026-01-15'),
        endDate: null,
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{
        id: string;
        name: string;
        number: number;
        startDate: string;
        endDate: string | null;
      }>;
    };

    expect(result.sessions).toHaveLength(3);
    expect(result.sessions[0]!.number).toBe(0);
    expect(result.sessions[1]!.number).toBe(1);
    expect(result.sessions[2]!.number).toBe(2);
  });

  it('serializes session startDate as ISO string and endDate as ISO string or null', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const sessionDocs = [
      {
        _id: 'sess-0',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01T18:00:00Z'),
        endDate: null,
      },
      {
        _id: 'sess-1',
        name: 'Session 1',
        number: 1,
        startDate: new Date('2026-01-08T18:00:00Z'),
        endDate: new Date('2026-01-08T22:00:00Z'),
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{ startDate: string; endDate: string | null }>;
    };

    expect(result.sessions[0]!.startDate).toBe('2026-01-01T18:00:00.000Z');
    expect(result.sessions[0]!.endDate).toBeNull();
    expect(result.sessions[1]!.startDate).toBe('2026-01-08T18:00:00.000Z');
    expect(result.sessions[1]!.endDate).toBe('2026-01-08T22:00:00.000Z');
  });

  it('includes status in serialized session data', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const sessionDocs = [
      {
        _id: 'sess-0',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01'),
        endDate: null,
        status: 'active',
      },
      {
        _id: 'sess-1',
        name: 'Session 1',
        number: 1,
        startDate: new Date('2026-01-08'),
        endDate: new Date('2026-01-08T23:00:00Z'),
        status: 'completed',
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{ id: string; status: string }>;
    };

    expect(result.sessions[0]!.status).toBe('active');
    expect(result.sessions[1]!.status).toBe('completed');
  });

  it('returns multiple gmScreens for GM entering campaign', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const gmScreenDocs = [
      { _id: 'gms-1', name: 'Default' },
      { _id: 'gms-2', name: 'Combat Tracker' },
    ];
    vi.mocked(GMScreen.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue(gmScreenDocs),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      gmScreens: Array<{ id: string; name: string }>;
    };

    expect(result.gmScreens).toHaveLength(2);
    expect(result.gmScreens[0]!.name).toBe('Default');
    expect(result.gmScreens[1]!.name).toBe('Combat Tracker');
  });

  it('player entering campaign sees sessions but not gmScreens', async () => {
    const campaign = makeCampaign({
      gameMasterId: 'gm-user',
      members: [
        { userId: 'gm-user', role: 'gm' },
        { userId: 'dbuser-1', role: 'player' },
      ],
    });
    campaignsDouble.get.mockResolvedValue(campaign);
    const sessionDocs = [
      {
        _id: 'sess-0',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{ name: string }>;
      gmScreens?: unknown[];
      isOwner: boolean;
    };

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.name).toBe('Session 0');
    expect(GMScreen.find).not.toHaveBeenCalled();
    expect(result.gmScreens).toBeUndefined();
    expect(result.isOwner).toBe(false);
  });

  it('GM entering campaign sees both sessions and gmScreens', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const sessionDocs = [
      {
        _id: 'sess-0',
        name: 'Session 0',
        number: 0,
        startDate: new Date('2026-01-01'),
        endDate: null,
      },
    ];
    vi.mocked(Session.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessionDocs) }),
    } as never);
    const gmScreenDocs = [{ _id: 'gms-1', name: 'Default' }];
    vi.mocked(GMScreen.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue(gmScreenDocs),
    } as never);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as {
      sessions: Array<{ name: string }>;
      gmScreens?: Array<{ name: string }>;
      isOwner: boolean;
    };

    expect(result.sessions).toHaveLength(1);
    expect(result.gmScreens).toHaveLength(1);
    expect(result.isOwner).toBe(true);
  });

  it('queries sessions with sort by number ascending', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockSort = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    vi.mocked(Session.find).mockReturnValue({ sort: mockSort } as never);

    await _getCampaign({ data: { id: 'camp-1' } });

    expect(mockSort).toHaveBeenCalledWith({ number: 1 });
  });

  it('returns empty sessions array when campaign has no sessions yet', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);

    const result = (await _getCampaign({ data: { id: 'camp-1' } })) as { sessions: unknown[] };

    expect(result.sessions).toEqual([]);
  });
});

describe('updateCampaign with imagePath (direct R2 upload)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CDN_URL = 'https://cdn.example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts imagePath and sets it on the campaign', async () => {
    campaignsDouble.get.mockResolvedValue(makeCampaign());
    applyUpdatesToGet();

    await _updateCampaign({
      data: {
        id: 'camp-1',
        name: 'Updated Name',
        description: '',
        imagePath: 'https://cdn.example.com/uploads/campaigns/img.webp',
      },
    });

    const updated = await campaignsDouble.update.mock.results[0]!.value;
    expect(updated.imagePath).toBe('https://cdn.example.com/uploads/campaigns/img.webp');
  });

  it('throws when imagePath origin does not match CDN_URL', async () => {
    campaignsDouble.get.mockResolvedValue(makeCampaign());

    await expect(
      _updateCampaign({
        data: {
          id: 'camp-1',
          name: 'Updated Name',
          description: '',
          imagePath: 'https://evil.com/malicious.jpg',
        },
      })
    ).rejects.toThrow('Invalid image path');
  });
});

describe('activateSession', () => {
  it('deactivates the current active session and activates the target session', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockSessionFn = vi
      .fn()
      .mockResolvedValueOnce({ _id: 'sess-old', campaignId: 'camp-1', status: 'active' })
      .mockResolvedValueOnce({ _id: 'sess-new', campaignId: 'camp-1', status: 'not_started' });
    vi.mocked(Session.findOne).mockReturnValue({
      session: mockSessionFn,
    } as never);

    const result = await _activateSession({
      data: { campaignId: 'camp-1', sessionId: 'sess-new' },
    });

    expect(result).toMatchObject({ success: true });

    // Should deactivate old session
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-old' },
      { $set: { status: 'completed', endDate: expect.any(Date), updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    );

    // Should activate new session
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-new', campaignId: 'camp-1' },
      { $set: { status: 'active', updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('uses GM-provided endDate when supplied', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockSessionFn = vi
      .fn()
      .mockResolvedValueOnce({ _id: 'sess-old', campaignId: 'camp-1', status: 'active' })
      .mockResolvedValueOnce({ _id: 'sess-new', campaignId: 'camp-1', status: 'not_started' });
    vi.mocked(Session.findOne).mockReturnValue({
      session: mockSessionFn,
    } as never);

    await _activateSession({
      data: { campaignId: 'camp-1', sessionId: 'sess-new', endDate: '2026-03-15T22:00:00.000Z' },
    });

    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-old' },
      {
        $set: {
          status: 'completed',
          endDate: new Date('2026-03-15T22:00:00.000Z'),
          updatedAt: expect.any(Date),
        },
      },
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('activates session even when no currently active session exists', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    // First findOne (active session) returns null, second (target session) returns a session
    const mockSessionFn = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'sess-new', campaignId: 'camp-1', status: 'not_started' });
    vi.mocked(Session.findOne).mockReturnValue({
      session: mockSessionFn,
    } as never);

    const result = await _activateSession({
      data: { campaignId: 'camp-1', sessionId: 'sess-new' },
    });

    expect(result).toMatchObject({ success: true });

    // Should only activate the new session (one updateOne call, not two)
    expect(Session.updateOne).toHaveBeenCalledTimes(1);
    expect(Session.updateOne).toHaveBeenCalledWith(
      { _id: 'sess-new', campaignId: 'camp-1' },
      { $set: { status: 'active', updatedAt: expect.any(Date) } },
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it('throws when user is not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } })
    ).rejects.toThrow('Not authenticated');
  });

  it('throws when user is not the campaign GM', async () => {
    const campaign = makeCampaign({ gameMasterId: 'someone-else' });
    campaignsDouble.get.mockResolvedValue(campaign);

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } })
    ).rejects.toThrow('Forbidden');
  });

  it('skips deactivation when the target session is already the active session', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue({ _id: 'sess-1', campaignId: 'camp-1', status: 'active' }),
    } as never);

    const result = await _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-1' } });

    expect(result).toMatchObject({ success: true });
    // No updates needed — it's already active
    expect(Session.updateOne).not.toHaveBeenCalled();
  });

  it('throws when target session does not exist', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    // No active session, and target session doesn't exist
    vi.mocked(Session.findOne).mockReturnValue({
      session: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'nonexistent' } })
    ).rejects.toThrow('Session not found');
  });

  it('ends the mongo session even when the transaction fails', async () => {
    const campaign = makeCampaign();
    campaignsDouble.get.mockResolvedValue(campaign);
    const mockSessionFn = vi
      .fn()
      .mockResolvedValueOnce({ _id: 'sess-old', campaignId: 'camp-1', status: 'active' })
      .mockResolvedValueOnce({ _id: 'sess-new', campaignId: 'camp-1', status: 'not_started' });
    vi.mocked(Session.findOne).mockReturnValue({
      session: mockSessionFn,
    } as never);
    vi.mocked(Session.updateOne).mockRejectedValue(new Error('DB write failed'));

    await expect(
      _activateSession({ data: { campaignId: 'camp-1', sessionId: 'sess-new' } })
    ).rejects.toThrow();

    expect(mockMongoSession.endSession).toHaveBeenCalled();
  });
});
