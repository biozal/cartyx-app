import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/identity', () => ({
  identityRepository: {
    findProfile: vi.fn(),
    readPreferences: vi.fn(),
    setRulerColor: vi.fn(),
    recordLogin: vi.fn(),
  },
}));
vi.mock('~/server/session', () => ({ getSession: vi.fn(), clearSession: vi.fn() }));
vi.mock('~/server/db/connection', () => ({ connectDB: vi.fn(), isDBConnected: vi.fn() }));
vi.mock('~/server/utils/oauth', () => ({ revokeToken: vi.fn() }));
vi.mock('~/server/utils/telemetry', () => ({
  serverCaptureException: vi.fn(),
  serverCaptureEvent: vi.fn(),
}));

import { identityRepository } from '~/server/repositories/identity';
import { connectDB, isDBConnected } from '~/server/db/connection';
import { getSession, clearSession } from '~/server/session';
import { revokeToken } from '~/server/utils/oauth';
import { getMe, getUserPreferences, setRulerColor, logoutFn } from '~/server/functions/auth';
import { DEFAULT_RULER_COLOR } from '~/types/schemas/userPreferences';

const session = {
  id: 'google_subject',
  provider: 'google',
  name: 'Name',
  email: 'person@example.invalid',
  avatar: null,
  role: 'player',
  tokenIssuedAt: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(isDBConnected).mockReturnValue(true);
});

describe('auth through the identity repository', () => {
  it('refreshes the role without writing login state and only returns public session fields', async () => {
    vi.mocked(getSession).mockResolvedValue({ ...session, accessToken: 'must-not-leak' } as never);
    vi.mocked(identityRepository.findProfile).mockResolvedValue({
      id: 'mongo-id',
      role: 'gm',
      oauthTokens: 'must-not-leak',
    } as never);
    expect(await getMe()).toEqual({
      id: session.id,
      provider: 'google',
      name: 'Name',
      email: session.email,
      avatar: null,
      role: 'gm',
    });
    expect(identityRepository.findProfile).toHaveBeenCalledWith(session.id);
    expect(identityRepository.recordLogin).not.toHaveBeenCalled();
  });

  it('does not access storage for an anonymous request', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(await getMe()).toBeNull();
    expect(await getUserPreferences()).toEqual({ rulerColor: DEFAULT_RULER_COLOR });
    await expect(setRulerColor({ data: { rulerColor: '#abcdef' } })).rejects.toThrow(
      'Not authenticated'
    );
    expect(connectDB).not.toHaveBeenCalled();
    expect(identityRepository.setRulerColor).not.toHaveBeenCalled();
  });

  it('preserves getMe display fallback when role lookup fails', async () => {
    vi.mocked(identityRepository.findProfile).mockRejectedValue(new Error('read failed'));
    expect(await getMe()).toMatchObject({ id: session.id, role: 'player' });
  });

  it('preserves preferences fallback on an unavailable database, but refuses writes', async () => {
    vi.mocked(isDBConnected).mockReturnValue(false);
    expect(await getUserPreferences()).toEqual({ rulerColor: DEFAULT_RULER_COLOR });
    await expect(setRulerColor({ data: { rulerColor: '#abcdef' } })).rejects.toThrow(
      'Database not available'
    );
    expect(identityRepository.readPreferences).not.toHaveBeenCalled();
    expect(identityRepository.setRulerColor).not.toHaveBeenCalled();
  });

  it('reads and writes preferences using the session provider identity', async () => {
    vi.mocked(identityRepository.readPreferences).mockResolvedValue({ rulerColor: '#123456' });
    expect(await getUserPreferences()).toEqual({ rulerColor: '#123456' });
    expect(identityRepository.readPreferences).toHaveBeenCalledWith(session.id);
    expect(await setRulerColor({ data: { rulerColor: '#abcdef' } })).toEqual({
      rulerColor: '#abcdef',
    });
    expect(identityRepository.setRulerColor).toHaveBeenCalledWith(session.id, '#abcdef');
  });

  it('propagates a failed preference write', async () => {
    vi.mocked(identityRepository.setRulerColor).mockRejectedValue(new Error('write failed'));
    await expect(setRulerColor({ data: { rulerColor: '#abcdef' } })).rejects.toThrow(
      'write failed'
    );
  });

  it('clears the session even when provider revocation fails', async () => {
    vi.mocked(revokeToken).mockRejectedValue(new Error('provider unavailable'));
    expect(await logoutFn()).toEqual({ success: true });
    expect(clearSession).toHaveBeenCalledOnce();
  });
});
