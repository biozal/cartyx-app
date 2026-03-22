import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { clearSession, getSession } from '~/server/session'
import { revokeToken } from '~/server/utils/oauth'

export const performLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await getSession()
  if (user) await revokeToken(user)
  await clearSession()
  throw redirect({ to: '/' })
})

export const Route = createFileRoute('/auth/logout')({
  component: () => null,
})
