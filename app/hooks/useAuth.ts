import { createServerFn } from '@tanstack/react-start'
import { useAuthContext } from '~/providers/AuthProvider'

const logoutServerFn = createServerFn({ method: 'POST' })
  .handler(async () => {
    const { logoutFn } = await import('~/server/functions/auth')
    return logoutFn()
  })

export function useAuth() {
  const { user, isAuthenticated, isLoading, refresh } = useAuthContext()

  const logout = async () => {
    try {
      const result = await logoutServerFn()
      if (result?.success) {
        window.location.href = '/'
      } else {
        await refresh()
      }
    } catch {
      await refresh()
    }
  }

  const login = (provider: 'google' | 'github' | 'apple') => {
    window.location.href = `/auth/${provider}`
  }

  return { user, isAuthenticated, isLoading, login, logout, refresh }
}
