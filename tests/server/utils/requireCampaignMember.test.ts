import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/server/session', () => ({ getSession: vi.fn() }));
vi.mock('~/server/db/connection', () => ({
  connectDB: vi.fn(),
  isDBConnected: vi.fn(() => true),
}));
vi.mock('~/server/repositories/identity', () => import('../functions/identityTestDouble'));
vi.mock('~/server/repositories/campaigns', () => import('../functions/campaignsTestDouble'));

import { getSession } from '~/server/session';
import { connectDB, isDBConnected } from '~/server/db/connection';
import { resetIdentityDouble } from '../functions/identityTestDouble';
import { campaigns as campaignsDouble } from '../functions/campaignsTestDouble';
import { requireCampaignMember, CampaignAccessError } from '~/server/utils/requireCampaignMember';

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(mockSession);
  vi.mocked(isDBConnected).mockReturnValue(true);
  resetIdentityDouble(mockDbUser);
});

describe('requireCampaignMember', () => {
  it('never grants ownership by stringifying an absent owner', async () => {
    resetIdentityDouble({ id: 'null' });
    campaignsDouble.get.mockResolvedValue({ members: [] } as never);
    await expect(requireCampaignMember('camp-A')).rejects.toBeInstanceOf(CampaignAccessError);
  });
  it('allows the legacy campaign owner even without a members entry', async () => {
    campaignsDouble.get.mockResolvedValue({
      gameMasterId: 'dbuser-1',
      members: [],
    } as never);
    expect(await requireCampaignMember('camp-A')).toMatchObject({ userId: 'dbuser-1', isGM: true });
  });

  it('rereads membership and denies a revoked member despite the session GM role', async () => {
    campaignsDouble.get.mockResolvedValueOnce({
      gameMasterId: 'another-owner',
      members: [{ userId: 'dbuser-1', role: 'gm' }],
    } as never);
    expect(await requireCampaignMember('camp-A')).toMatchObject({ isGM: true });
    campaignsDouble.get.mockResolvedValueOnce({
      gameMasterId: 'another-owner',
      members: [],
    } as never);
    await expect(requireCampaignMember('camp-A')).rejects.toBeInstanceOf(CampaignAccessError);
    expect(campaignsDouble.get).toHaveBeenCalledTimes(2);
  });

  it('allows the GM (gameMasterId match) and reports isGM', async () => {
    campaignsDouble.get.mockResolvedValue({
      _id: 'camp-A',
      gameMasterId: 'dbuser-1',
      members: [{ userId: 'dbuser-1', role: 'gm' }],
    } as never);

    const result = await requireCampaignMember('camp-A');

    expect(result).toEqual({
      userId: 'dbuser-1',
      sessionUserId: 'session-user-1',
      isGM: true,
    });
  });

  it('allows a non-GM member and reports isGM false', async () => {
    campaignsDouble.get.mockResolvedValue({
      _id: 'camp-A',
      gameMasterId: 'someone-else',
      members: [{ userId: 'dbuser-1', role: 'player' }],
    } as never);

    const result = await requireCampaignMember('camp-A');

    expect(result).toEqual({
      userId: 'dbuser-1',
      sessionUserId: 'session-user-1',
      isGM: false,
    });
  });

  it('rejects a user who is not a member of the campaign, as a CampaignAccessError', async () => {
    campaignsDouble.get.mockResolvedValue({
      _id: 'camp-A',
      gameMasterId: 'someone-else',
      members: [{ userId: 'another-member', role: 'player' }],
    } as never);

    // The TYPE is what `reportSoundboardError` keys off to keep an
    // attacker-driven `loadBoardStateFn` loop out of GlitchTip, so it is
    // asserted directly and not inferred from the message. Still an `Error`
    // subclass — the ~30 other callers of this helper catch generically and
    // are unaffected.
    const err = await requireCampaignMember('camp-A').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CampaignAccessError);
    expect(err).toBeInstanceOf(Error);
  });

  /**
   * The two caller-reachable failures must be INDISTINGUISHABLE. Separate
   * messages ("Forbidden" vs "Campaign not found") let any authenticated user
   * enumerate which guessed 24-hex ids name real campaigns, purely from which
   * error comes back — an existence oracle over every campaign in the system.
   */
  it('answers a non-member and a missing campaign with the identical message', async () => {
    campaignsDouble.get.mockResolvedValue({
      _id: 'camp-A',
      gameMasterId: 'someone-else',
      members: [{ userId: 'another-member', role: 'player' }],
    } as never);
    const nonMember = await requireCampaignMember('camp-A').catch((e: unknown) => e);

    campaignsDouble.get.mockResolvedValue(null as never);
    const missing = await requireCampaignMember('camp-A').catch((e: unknown) => e);

    expect((nonMember as Error).message).toBe((missing as Error).message);
    expect((missing as Error).message).toBe('Campaign not found');
  });

  it('rejects when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);

    await expect(requireCampaignMember('camp-A')).rejects.toThrow('Not authenticated');
    expect(connectDB).not.toHaveBeenCalled();
  });

  it('throws when the database is unavailable', async () => {
    vi.mocked(isDBConnected).mockReturnValue(false);

    await expect(requireCampaignMember('camp-A')).rejects.toThrow('Database not available');
  });

  it('throws when the DB user is not found', async () => {
    resetIdentityDouble(null);

    await expect(requireCampaignMember('camp-A')).rejects.toThrow('User not found');
  });

  it('throws a CampaignAccessError when the campaign is not found', async () => {
    campaignsDouble.get.mockResolvedValue(null as never);

    await expect(requireCampaignMember('camp-A')).rejects.toThrow('Campaign not found');
    await expect(requireCampaignMember('camp-A')).rejects.toBeInstanceOf(CampaignAccessError);
  });
});
