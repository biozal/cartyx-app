import { createRootRoute, Outlet, ScrollRestoration } from '@tanstack/react-router'
import { AuthProvider } from '~/providers/AuthProvider'
import { PostHogProvider } from '~/providers/PostHogProvider'
import '~/styles/globals.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AuthProvider>
      <PostHogProvider>
        <ScrollRestoration />
        <Outlet />
      </PostHogProvider>
    </AuthProvider>
  )
}
