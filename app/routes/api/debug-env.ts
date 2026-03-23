import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

const checkEnv = createServerFn({ method: 'GET' }).handler(async () => {
  return {
    hasBaseUrl: !!process.env.BASE_URL,
    baseUrl: process.env.BASE_URL ?? '(not set)',
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasGithubClientId: !!process.env.GITHUB_CLIENT_ID,
    hasGithubClientSecret: !!process.env.GITHUB_CLIENT_SECRET,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasMongoUri: !!process.env.MONGODB_URI,
    hasCdnUrl: !!process.env.CDN_URL,
    hasR2Bucket: !!process.env.R2_BUCKET,
    hasPosthogKey: !!process.env.POSTHOG_KEY,
    nodeEnv: process.env.NODE_ENV ?? '(not set)',
    vercel: process.env.VERCEL ?? '(not set)',
  }
})

export const Route = createFileRoute('/api/debug-env')({
  beforeLoad: async () => {
    const result = await checkEnv()
    throw new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
  component: () => null,
})
