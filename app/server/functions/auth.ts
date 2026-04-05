import { createServerFn } from '@tanstack/react-start';
import { getSession, clearSession } from '../session';
import { revokeToken } from '../utils/oauth';
import { connectDB, isDBConnected } from '../db/connection';
import { User } from '../db/models/User';
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog';

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

export const getMe = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await getSession();
    if (!user) return null;

    // Sync role from DB (read-only — don't update lastLoginAt on every page load)
    await connectDB();
    if (isDBConnected()) {
      try {
        const stored = await User.findOne({ providerId: user.id } as any).lean();
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

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
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
