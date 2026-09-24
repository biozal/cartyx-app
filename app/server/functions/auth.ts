import { z } from 'zod';
import { getSession, clearSession } from '../session';
import { revokeToken } from '../utils/oauth';
import { connectDB, isDBConnected } from '../db/connection';
import { identityRepository, ensureIdentityAvailable } from '../repositories/identity';
import { serverCaptureException, serverCaptureEvent } from '../utils/telemetry';
import { withLogging } from '../utils/logger';
import {
  setRulerColorSchema,
  DEFAULT_RULER_COLOR,
  type UserPreferences,
} from '~/types/schemas/userPreferences';

/** Strip sensitive fields (tokens) before sending session data to the client */
function toClientUser(user: {
  id: string;
  provider: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: string;
}) {
  const { id, provider, name, email, avatar, role } = user;
  return { id, provider, name, email, avatar, role };
}

export const getMe = withLogging('auth.getMe', async () => {
  try {
    const user = await getSession();
    if (!user) return null;

    // Sync role from DB (read-only — don't update lastLoginAt on every page load)
    if (await ensureIdentityAvailable()) {
      try {
        const stored = await identityRepository.findProfile(user.id);
        if (stored) return toClientUser({ ...user, role: stored.role as string });
      } catch (e) {
        serverCaptureException(e, user.id, { action: 'getMe', step: 'roleSyncFromDB' });
      }
    }

    // Never send accessToken/refreshToken to client
    return toClientUser(user);
  } catch (e) {
    serverCaptureException(e, undefined, { action: 'getMe' });
    throw e;
  }
});

export const logoutFn = withLogging('auth.logoutFn', async () => {
  let userId: string | undefined;
  try {
    const user = await getSession();
    userId = user?.id;
    if (user) {
      serverCaptureEvent(user.id, 'user_logged_out', { provider: user.provider });
      try {
        await revokeToken(user);
      } catch (revokeError) {
        serverCaptureException(revokeError, user.id, { action: 'logoutFn', step: 'revokeToken' });
      }
    }
    await clearSession();
    return { success: true };
  } catch (e) {
    serverCaptureException(e, userId, { action: 'logoutFn' });
    return { success: false };
  }
});

/** Read the current user's persisted UI preferences (ruler color, etc.). */
export const getUserPreferences = withLogging(
  'auth.getUserPreferences',
  async (): Promise<UserPreferences> => {
    const fallback: UserPreferences = { rulerColor: DEFAULT_RULER_COLOR };
    try {
      const user = await getSession();
      if (!user) return fallback;

      if (!(await ensureIdentityAvailable())) return fallback;

      const stored = await identityRepository.readPreferences(user.id);
      return {
        rulerColor: stored?.rulerColor || DEFAULT_RULER_COLOR,
      };
    } catch (e) {
      serverCaptureException(e, undefined, { action: 'getUserPreferences' });
      return fallback;
    }
  }
);

/** Persist the current user's measurement (ruler) line color. */
export const setRulerColor = withLogging(
  'auth.setRulerColor',
  async ({ data }: { data: z.infer<typeof setRulerColorSchema> }): Promise<UserPreferences> => {
    let userId: string | undefined;
    try {
      const user = await getSession();
      if (!user) throw new Error('Not authenticated');
      userId = user.id;

      if (!(await ensureIdentityAvailable())) throw new Error('Database not available');

      await identityRepository.setRulerColor(user.id, data.rulerColor);

      serverCaptureEvent(user.id, 'ruler_color_updated', { ruler_color: data.rulerColor });
      return { rulerColor: data.rulerColor };
    } catch (e) {
      serverCaptureException(e, userId, { action: 'setRulerColor' });
      throw e;
    }
  }
);

export const getPartyToken = withLogging(
  'auth.getPartyToken',
  async ({ data }: { data: { sessionId: string } }) => {
    const user = await getSession();
    if (!user) return '';

    await connectDB();
    if (!isDBConnected()) return '';

    const { requireSessionAccess } = await import('./sessionAccess');
    const { isGM } = await requireSessionAccess(data.sessionId, user.id);

    const { createPartyToken } = await import('../session');
    return createPartyToken(user.id, data.sessionId, isGM ? 'gm' : 'player');
  }
);
