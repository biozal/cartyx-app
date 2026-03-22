import { useEffect, type ReactNode } from 'react'
import posthog from 'posthog-js'
import { useAuthContext } from './AuthProvider'

let initialized = false

function PostHogInit() {
  const { user } = useAuthContext()

  useEffect(() => {
    const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com'

    if (!key || initialized) return
    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // manual page view tracking
      persistence: 'localStorage+cookie',
    })
    initialized = true
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (user) {
      posthog.identify(user.id, {
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
      })
    } else {
      posthog.reset()
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
  if (initialized) posthog.capture('$pageview', { $current_url: url })
}
