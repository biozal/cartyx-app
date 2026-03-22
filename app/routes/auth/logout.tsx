import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { clearSession, getSession } from '~/server/session'
import { revokeToken } from '~/server/utils/oauth'

const performLogout = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getSession()
  if (user) await revokeToken(user)
  await clearSession()
  throw redirect({ to: '/' })
})

export const Route = createFileRoute('/auth/logout')({
  beforeLoad: async () => {
    await performLogout()
  },
  component: () => null,
})
