import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('~/server/repositories/identity', () => ({ identityRepository: { findProfile: vi.fn() } }));
vi.mock('~/server/db/models/Session', () => ({ Session: { findById: vi.fn() } }));
vi.mock('~/server/db/models/Campaign', () => ({ Campaign: { findById: vi.fn() } }));

import { identityRepository } from '~/server/repositories/identity';
import { Session } from '~/server/db/models/Session';
import { Campaign } from '~/server/db/models/Campaign';
import { requireSessionAccess } from '~/server/functions/sessionAccess';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(identityRepository.findProfile).mockResolvedValue({
    id: 'application-user-id',
    role: 'gm',
  });
  vi.mocked(Session.findById).mockReturnValue({
    select: () => ({ lean: async () => ({ campaignId: 'campaign-1' }) }),
  } as never);
});

it('uses the repository application ID and campaign member role, not the global role', async () => {
  vi.mocked(Campaign.findById).mockReturnValue({
    lean: async () => ({ members: [{ userId: 'application-user-id', role: 'player' }] }),
  } as never);
  expect(await requireSessionAccess('session-1', 'google_subject')).toMatchObject({
    campaignId: 'campaign-1',
    isGM: false,
    dbUser: { id: 'application-user-id' },
  });
  expect(identityRepository.findProfile).toHaveBeenCalledWith('google_subject');
  expect(Campaign.findById).toHaveBeenCalledWith('campaign-1');
});

it('preserves session access membership requirement even for a legacy campaign owner', async () => {
  vi.mocked(Campaign.findById).mockReturnValue({
    lean: async () => ({ gameMasterId: 'application-user-id', members: [] }),
  } as never);
  await expect(requireSessionAccess('session-1', 'google_subject')).rejects.toThrow('Forbidden');
});

it('rereads session membership and refuses a revoked GM', async () => {
  vi.mocked(Campaign.findById).mockReturnValueOnce({
    lean: async () => ({ members: [{ userId: 'application-user-id', role: 'gm' }] }),
  } as never);
  expect(await requireSessionAccess('session-1', 'google_subject')).toMatchObject({ isGM: true });
  vi.mocked(Campaign.findById).mockReturnValueOnce({
    lean: async () => ({ members: [{ userId: 'another-user', role: 'gm' }] }),
  } as never);
  await expect(requireSessionAccess('session-1', 'google_subject')).rejects.toThrow('Forbidden');
});

it('refuses a missing account before reading a session', async () => {
  vi.mocked(identityRepository.findProfile).mockResolvedValue(null);
  await expect(requireSessionAccess('session-1', 'google_subject')).rejects.toThrow(
    'User not found'
  );
  expect(Session.findById).not.toHaveBeenCalled();
});
