import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { getSession, clearSession } from '../session'
import { revokeToken } from '../utils/oauth'
import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'

export const getMe = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSession()
  if (!user) return null

  // Sync role from DB on each call
  await connectDB()
  if (isDBConnected()) {
    try {
      const stored = await User.findOneAndUpdate(
        { providerId: user.id },
        { lastLoginAt: new Date() },
        { new: true }
      )
      if (stored) return { ...user, role: stored.role as string }
    } catch {
      // non-fatal
    }
  }

  return user
})

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await getSession()
  if (user) await revokeToken(user)
  await clearSession()
  throw redirect({ to: '/' })
})
