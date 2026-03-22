import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getMe } from '~/server/functions/auth'

export interface AuthUser {
  id: string
  provider: string
  name: string | null
  email: string | null
  avatar: string | null
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me as AuthUser | null)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  return useContext(AuthContext)
}
