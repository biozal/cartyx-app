import { useAuthContext } from '~/providers/AuthProvider'
import { logoutFn } from '~/server/functions/auth'

export function useAuth() {
  const { user, isAuthenticated, isLoading, refresh } = useAuthContext()

  const logout = async () => {
    try {
      const result = await logoutFn()
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
