import { PostHog } from 'posthog-node'

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (client) return client

  const apiKey = process.env.POSTHOG_KEY
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com'

  if (!apiKey) return null

  client = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 })
  return client
}

export function serverCaptureException(
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getClient()
  if (!ph) return

  const id = distinctId ?? 'server'
  const err = error instanceof Error ? error : new Error(String(error))

  ph.capture({
    distinctId: id,
    event: '$exception',
    properties: {
      $exception_message: err.message,
      $exception_type: err.constructor.name,
      $exception_stack_trace_raw: err.stack,
      ...properties,
    },
  })
}

export function serverCaptureEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getClient()
  if (!ph) return
  ph.capture({ distinctId, event, properties })
}

export async function shutdownPostHog(): Promise<void> {
  if (client) {
    await client.shutdown()
    client = null
  }
}
