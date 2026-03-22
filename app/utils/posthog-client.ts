/**
 * Client-side PostHog capture helpers.
 *
 * Extracted from PostHogProvider to avoid circular dependencies
 * (PostHogProvider imports AuthProvider; other providers/hooks
 * need to call captureException without importing PostHogProvider).
 *
 * PostHogProvider calls `setPostHogInstance` once initialised;
 * all capture helpers are safe to call before that (they no-op).
 */

let posthogInstance: typeof import('posthog-js').default | null = null
let initialized = false

export function setPostHogInstance(instance: typeof import('posthog-js').default): void {
  posthogInstance = instance
  initialized = true
}

export function isPostHogReady(): boolean {
  return initialized && posthogInstance !== null
}

export function getPostHogInstance(): typeof import('posthog-js').default | null {
  return posthogInstance
}

export function capturePageView(url: string): void {
  if (initialized && posthogInstance) posthogInstance.capture('$pageview', { $current_url: url })
}

export function captureException(error: unknown, additionalProperties?: Record<string, unknown>): void {
  if (!initialized || !posthogInstance) return
  posthogInstance.captureException(error instanceof Error ? error : new Error(String(error)), additionalProperties)
}

export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (!initialized || !posthogInstance) return
  posthogInstance.capture(event, properties)
}
