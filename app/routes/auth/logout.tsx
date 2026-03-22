import { createFileRoute } from '@tanstack/react-router'

// Logout is handled via the POST server function `logoutFn` in server/functions/auth.ts.
// This route exists only as a fallback — it renders nothing.
export const Route = createFileRoute('/auth/logout')({
  component: () => null,
})
