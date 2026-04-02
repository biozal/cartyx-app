import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSessions, createSession, updateSession } from '~/server/functions/sessions'
import { activateSession } from '~/server/functions/campaigns'
import { captureException } from '~/providers/PostHogProvider'
import { queryKeys } from '~/utils/queryKeys'

export function useSessions(campaignId: string, includeCompleted: boolean) {
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: queryKeys.sessions.list(campaignId, includeCompleted),
    queryFn: () => listSessions({ data: { campaignId, includeCompleted } }),
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
      createSession({ data: input }),
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
      updateSession({ data: input }),
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
      activateSession({ data: input }),
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
