import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

const checkEnv = createServerFn({ method: 'GET' }).handler(async () => {
  const results: Record<string, string> = {}

  // Check env vars for whitespace
  const vars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'BASE_URL', 'SESSION_SECRET', 'MONGODB_URI'] as const
  for (const v of vars) {
    const val = process.env[v]
    if (!val) {
      results[v] = 'NOT SET'
    } else if (val !== val.trim()) {
      results[v] = `HAS WHITESPACE (length: ${val.length}, trimmed: ${val.trim().length})`
    } else {
      results[v] = `OK (${val.length} chars)`
    }
  }

  // Test MongoDB connection
  try {
    const { connectDB, isDBConnected } = await import('~/server/db/connection')
    await connectDB()
    results['MONGODB'] = isDBConnected() ? 'CONNECTED' : 'NOT CONNECTED'
  } catch (e) {
    results['MONGODB'] = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  // Check GOOGLE_CLIENT_SECRET length (should be ~24 chars for Google)
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (secret) {
    results['GOOGLE_SECRET_PREFIX'] = secret.substring(0, 8) + '...'
    results['GOOGLE_SECRET_LENGTH'] = String(secret.length)
  }

  return results
})

export const Route = createFileRoute('/api/debug-env')({
  loader: async () => await checkEnv(),
  component: function DebugEnv() {
    const data = Route.useLoaderData()
    return <pre>{JSON.stringify(data, null, 2)}</pre>
  },
})
