export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: () => ['campaigns', 'list'] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (campaignId: string) => ['notes', 'list', campaignId] as const,
    detail: (id: string) => ['notes', 'detail', id] as const,
  },
}
