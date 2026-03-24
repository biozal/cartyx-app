// Mock useAuth hook for Storybook
export function useAuth() {
  return {
    user: {
      name: 'Gandalf the Grey',
      email: 'gandalf@middleearth.com',
      avatar: null as string | null | undefined,
    },
    isAuthenticated: true,
    isLoading: false,
    login: (_provider: 'google' | 'github' | 'apple') => {},
    logout: async () => {},
    refresh: async () => {},
  }
}
