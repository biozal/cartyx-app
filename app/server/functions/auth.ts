import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { getSession, clearSession } from '../session'
import { revokeToken } from '../utils/oauth'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'

/** Strip sensitive fields (tokens) before sending session data to the client */
function toClientUser(user: { id: string; provider: string; name: string | null; email: string | null; avatar: string | null; role: string }) {
  const { id, provider, name, email, avatar, role } = user
  return { id, provider, name, email, avatar, role }
}

export const getMe = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSession()
  if (!user) return null

  // Sync role from DB (read-only — don't update lastLoginAt on every page load)
  await connectDB()
  if (isDBConnected()) {
    try {
      const stored = await User.findOne({ providerId: user.id }).lean()
      if (stored) return toClientUser({ ...user, role: stored.role as string })
    } catch {
      // non-fatal
    }
  }

  // Never send accessToken/refreshToken to client
  return toClientUser(user)
})

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await getSession()
  if (user) await revokeToken(user)
  await clearSession()
  throw redirect({ to: '/' })
})
