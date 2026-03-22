import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, deleteCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { exchangeGoogleCode, exchangeGithubCode, exchangeAppleCode, upsertUser } from '~/server/utils/oauth'
import { setSession } from '~/server/session'
import { serverCaptureException, serverCaptureEvent } from '~/server/utils/posthog'

const VALID_PROVIDERS = ['google', 'github', 'apple'] as const

const handleCallback = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ provider: z.enum(VALID_PROVIDERS), code: z.string(), state: z.string() }))
  .handler(async ({ data }) => {
    const { provider, code, state } = data

    // Verify CSRF state token
    const storedState = getCookie('oauth_state')
    deleteCookie('oauth_state', { path: '/' })

    if (!storedState || storedState !== state) {
      throw redirect({ to: '/', search: { reason: 'auth_failed' } })
    }

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
      await serverCaptureEvent(user.id, 'user_logged_in', { provider })
      throw redirect({ to: '/campaigns' })
    } catch (e) {
      // Re-throw redirect responses (TanStack Router throws redirects as special objects)
      if (e instanceof Response || (e && typeof e === 'object' && ('to' in e || 'href' in e))) throw e
      serverCaptureException(e, undefined, { action: 'handleOAuthCallback', provider })
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
    if (search.error || !search.code || !search.state) {
      throw redirect({ to: '/', search: { reason: 'auth_failed' } })
    }
    if (!VALID_PROVIDERS.includes(params.provider as typeof VALID_PROVIDERS[number])) {
      throw redirect({ to: '/', search: { reason: 'auth_failed' } })
    }
    await handleCallback({ data: { provider: params.provider as typeof VALID_PROVIDERS[number], code: search.code, state: search.state } })
  },
  component: () => null,
})
