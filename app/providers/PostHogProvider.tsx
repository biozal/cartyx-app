import { PostHogProvider as ReactPostHogProvider } from '@posthog/react'
import posthog from 'posthog-js'
import { useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useAuthContext } from './AuthProvider'
import {
  setPostHogInstance,
  isPostHogReady,
  capturePageView,
} from '~/utils/posthog-client'

// Re-export capture helpers so existing imports from PostHogProvider still work
export { captureException, captureEvent, capturePageView } from '~/utils/posthog-client'

function PostHogInit() {
  const { user } = useAuthContext()
  const router = useRouter()
  const unsubRef = useRef<(() => void) | null>(null)

  // Initialize PostHog client-side only
  useEffect(() => {
    const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com'

    if (!key || isPostHogReady() || typeof window === 'undefined') return

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // we capture manually on navigation
      persistence: 'localStorage+cookie',
      capture_exceptions: true,
    })
    setPostHogInstance(posthog)

    // Capture initial pageview
    capturePageView(window.location.href)

    // Subscribe to route changes for manual pageview tracking
    unsubRef.current = router.subscribe('onResolved', (event) => {
      capturePageView(window.location.origin + event.toLocation.href)
    })

    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [router])

  // Identify/reset on auth changes
  useEffect(() => {
    if (!isPostHogReady()) return

    if (user) {
      posthog.identify(user.id, {
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
      })
      posthog.reloadFeatureFlags()
    } else {
      posthog.reset()
      posthog.reloadFeatureFlags()
    }
  }, [user])

  return null
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <ReactPostHogProvider client={posthog}>
      <PostHogInit />
      {children}
    </ReactPostHogProvider>
  )
}
