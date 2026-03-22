import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exchangeGoogleCode, exchangeGithubCode, exchangeAppleCode, upsertUser } from '~/server/utils/oauth'
import { setSession } from '~/server/session'

const handleCallback = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ provider: z.string(), code: z.string() }))
  .handler(async ({ data }) => {
    const { provider, code } = data

    try {
      let profile
      if (provider === 'google') {
        profile = await exchangeGoogleCode(code)
      } else if (provider === 'github') {
        profile = await exchangeGithubCode(code)
      } else if (provider === 'apple') {
        profile = await exchangeAppleCode(code)
      } else {
        throw new Error(`Unsupported provider: ${provider}`)
      }

      const user = await upsertUser(profile)
      await setSession(user)
      throw redirect({ to: '/campaigns' })
    } catch (e) {
      // Re-throw redirect responses (TanStack Router throws redirects as special objects)
      if (e instanceof Response || (e && typeof e === 'object' && ('to' in e || 'href' in e))) throw e
      console.error(`OAuth callback error for ${provider}:`, e)
      throw redirect({ to: '/', search: { reason: 'auth_failed' } })
    }
  })

export const Route = createFileRoute('/auth/callback/$provider')({
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
    state: z.string().optional(),
  }),
  beforeLoad: async ({ params, search }) => {
    if (search.error || !search.code) {
      throw redirect({ to: '/', search: { reason: 'auth_failed' } })
    }
    await handleCallback({ data: { provider: params.provider, code: search.code } })
  },
  component: () => null,
})
