import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

const checkEnv = createServerFn({ method: 'GET' }).handler(async () => {
  // Check for trailing whitespace/newlines in critical env vars
  const vars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'BASE_URL', 'SESSION_SECRET', 'MONGODB_URI'] as const
  const issues: Record<string, string> = {}
  for (const v of vars) {
    const val = process.env[v]
    if (!val) {
      issues[v] = 'NOT SET'
    } else if (val !== val.trim()) {
      issues[v] = `HAS WHITESPACE (length: ${val.length}, trimmed: ${val.trim().length})`
    } else {
      issues[v] = 'OK'
    }
  }
  return issues
})

export const Route = createFileRoute('/api/debug-env')({
  loader: async () => await checkEnv(),
  component: function DebugEnv() {
    const data = Route.useLoaderData()
    return <pre>{JSON.stringify(data, null, 2)}</pre>
  },
})
