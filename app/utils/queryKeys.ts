export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: () => ['campaigns', 'list'] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
  },
  sessions: {
    all: ['sessions'] as const,
    list: (campaignId: string, includeCompleted: boolean) =>
      ['sessions', 'list', campaignId, String(includeCompleted)] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (campaignId: string, sessionId?: string, search?: string, visibility?: string) =>
      ['notes', 'list', campaignId, sessionId ?? '', search ?? '', visibility ?? 'all'] as const,
    detail: (id: string) => ['notes', 'detail', id] as const,
  },
}
