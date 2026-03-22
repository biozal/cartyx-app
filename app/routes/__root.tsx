import {
  createRootRoute,
  Outlet,
  ScrollRestoration,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { AuthProvider } from '~/providers/AuthProvider'
import { PostHogProvider } from '~/providers/PostHogProvider'
import '~/styles/globals.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Cartyx — D&D Campaign Management' },
      { name: 'description', content: 'Manage your D&D campaigns, invite players, and forge legendary adventures.' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <PostHogProvider>
            <ScrollRestoration />
            <Outlet />
          </PostHogProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
