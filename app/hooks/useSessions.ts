import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { captureException } from '~/providers/PostHogProvider'
import { queryKeys } from '~/utils/queryKeys'

const listSessionsFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    includeCompleted: z.boolean().optional(),
  }))
  .handler(async ({ data }) => {
    const { listSessions } = await import('~/server/functions/sessions')
    return listSessions({ data })
  })

const createSessionFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    startDate: z.string().datetime(),
  }))
  .handler(async ({ data }) => {
    const { createSession } = await import('~/server/functions/sessions')
    return createSession({ data })
  })

const updateSessionFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    sessionId: z.string().min(1),
    campaignId: z.string().min(1),
    name: z.string().min(1).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }))
  .handler(async ({ data }) => {
    const { updateSession } = await import('~/server/functions/sessions')
    return updateSession({ data })
  })

const activateSessionFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    campaignId: z.string().min(1),
    sessionId: z.string().min(1),
    endDate: z.string().datetime().optional(),
  }))
  .handler(async ({ data }) => {
    const { activateSession } = await import('~/server/functions/campaigns')
    return activateSession({ data })
  })

export function useSessions(campaignId: string, includeCompleted: boolean) {
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: queryKeys.sessions.list(campaignId, includeCompleted),
    queryFn: () => listSessionsFn({ data: { campaignId, includeCompleted } }),
  })
  return {
    sessions,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { campaignId: string; name: string; startDate: string }) =>
      createSessionFn({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e, { campaignId }) => {
      captureException(e, { action: 'createSession', campaignId })
    },
  })

  const create = async (input: { campaignId: string; name: string; startDate: string }) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    create,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}

export function useUpdateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { sessionId: string; campaignId: string; name?: string; startDate?: string; endDate?: string }) =>
      updateSessionFn({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e, { campaignId }) => {
      captureException(e, { action: 'updateSession', campaignId })
    },
  })

  const update = async (input: { sessionId: string; campaignId: string; name?: string; startDate?: string; endDate?: string }) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    update,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}

export function useActivateSession() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { campaignId: string; sessionId: string; endDate?: string }) =>
      activateSessionFn({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaignId) })
    },
    onError: (e, { campaignId }) => {
      captureException(e, { action: 'activateSession', campaignId })
    },
  })

  const activate = async (input: { campaignId: string; sessionId: string; endDate?: string }) => {
    try {
      return await mutation.mutateAsync(input)
    } catch {
      return null
    }
  }

  return {
    activate,
    isLoading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? String(mutation.error) : null,
  }
}
