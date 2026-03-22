import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  buildGoogleOAuthUrl,
  buildGithubOAuthUrl,
  buildAppleOAuthUrl,
  providerConfigured,
} from '~/server/utils/oauth'

const initiateOAuth = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => data as { provider: string })
  .handler(async ({ data }) => {
    const { provider } = data

    if (!providerConfigured(provider)) {
      throw redirect({ to: '/', search: { reason: 'provider_not_configured' } })
    }

    let url: string
    switch (provider) {
      case 'google':
        url = buildGoogleOAuthUrl()
        break
      case 'github':
        url = buildGithubOAuthUrl()
        break
      case 'apple':
        url = buildAppleOAuthUrl()
        break
      default:
        throw redirect({ to: '/' })
    }

    throw redirect({ href: url, statusCode: 302 } as never)
  })

export const Route = createFileRoute('/auth/$provider')({
  beforeLoad: async ({ params }) => {
    await initiateOAuth({ data: { provider: params.provider } })
  },
  component: () => null,
})
