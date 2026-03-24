import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  buildGoogleOAuthUrl,
  buildGithubOAuthUrl,
  buildAppleOAuthUrl,
  providerConfigured,
} from '~/server/utils/oauth'

const VALID_PROVIDERS = ['google', 'github', 'apple'] as const

const initiateOAuth = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ provider: z.enum(VALID_PROVIDERS) }))
  .handler(async ({ data }) => {
    const { provider } = data

    if (!providerConfigured(provider)) {
      throw redirect({ to: '/', search: { reason: 'provider_not_configured' } })
    }

    // Generate CSRF state token
    const { randomBytes } = await import('node:crypto')
    const state = randomBytes(32).toString('hex')

    // Store state in httpOnly cookie (short-lived, 10 min)
    setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    })

    let url: string
    switch (provider) {
      case 'google':
        url = buildGoogleOAuthUrl(state)
        break
      case 'github':
        url = buildGithubOAuthUrl(state)
        break
      case 'apple':
        url = buildAppleOAuthUrl(state)
        break
    }

    // Use a proper HTTP redirect Response for external OAuth URLs
    // redirect({ href }) doesn't work in createServerFn handlers on Nitro/Vercel
    throw new Response(null, {
      status: 302,
      headers: { Location: url },
    })
  })

export const Route = createFileRoute('/auth/$provider')({
  beforeLoad: async ({ params }) => {
    const provider = params.provider as string
    if (!VALID_PROVIDERS.includes(provider as typeof VALID_PROVIDERS[number])) {
      throw redirect({ to: '/' })
    }
    await initiateOAuth({ data: { provider: provider as typeof VALID_PROVIDERS[number] } })
  },
  component: () => null,
})
