import { createMiddleware } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { getSession } from '../session'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await getSession()
  if (!user) throw redirect({ to: '/', search: { reason: 'session_expired' } })
  return next({ context: { user } })
})
