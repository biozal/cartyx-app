import { useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useAuthContext } from './AuthProvider'

let posthogInstance: typeof import('posthog-js').default | null = null
let initialized = false

function PostHogInit() {
  const { user } = useAuthContext()
  const router = useRouter()
  const unsubRef = useRef<(() => void) | null>(null)

  // Initialize PostHog client-side only
  useEffect(() => {
    const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com'

    if (!key || initialized || typeof window === 'undefined') return

    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false, // we capture manually on navigation
        persistence: 'localStorage+cookie',
      })
      posthogInstance = posthog
      initialized = true

      // Capture initial pageview
      posthog.capture('$pageview', { $current_url: window.location.href })

      // Subscribe to route changes for manual pageview tracking
      unsubRef.current = router.subscribe('onResolved', (event) => {
        posthog.capture('$pageview', {
          $current_url: window.location.origin + event.toLocation.href,
        })
      })
    })

    return () => {
      unsubRef.current?.()
    }
  }, [router])

  // Identify/reset on auth changes
  useEffect(() => {
    if (!initialized || !posthogInstance) return
    if (user) {
      posthogInstance.identify(user.id, {
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
      })
    } else {
      posthogInstance.reset()
    }
  }, [user])

  return null
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <PostHogInit />
      {children}
    </>
  )
}

export function capturePageView(url: string) {
  if (initialized && posthogInstance) posthogInstance.capture('$pageview', { $current_url: url })
}
