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
  gmscreens: {
    all: ['gmscreens'] as const,
    list: (campaignId: string) => ['gmscreens', 'list', campaignId] as const,
    detail: (campaignId: string, screenId: string) =>
      ['gmscreens', 'detail', campaignId, screenId] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (
      campaignId: string,
      sessionId?: string,
      search?: string,
      visibility?: string,
      tags?: string[]
    ) =>
      [
        'notes',
        'list',
        campaignId,
        sessionId ?? '',
        search ?? '',
        visibility ?? 'all',
        tags ?? [],
      ] as const,
    detail: (id: string, campaignId?: string) => ['notes', 'detail', campaignId ?? '', id] as const,
  },
  characters: {
    all: ['characters'] as const,
    list: (
      campaignId: string,
      sessionId?: string,
      search?: string,
      visibility?: string,
      tags?: string[]
    ) =>
      [
        'characters',
        'list',
        campaignId,
        sessionId ?? '',
        search ?? '',
        visibility ?? 'all',
        tags ?? [],
      ] as const,
    detail: (id: string, campaignId?: string) =>
      ['characters', 'detail', campaignId ?? '', id] as const,
  },
  rules: {
    all: ['rules'] as const,
    list: (campaignId: string, search?: string, visibility?: string, tags?: string[]) =>
      ['rules', 'list', campaignId, search ?? '', visibility ?? 'all', tags ?? []] as const,
    detail: (id: string, campaignId?: string) => ['rules', 'detail', campaignId ?? '', id] as const,
  },
  tags: {
    all: ['tags'] as const,
    list: (campaignId: string) => ['tags', 'list', campaignId] as const,
  },
};
