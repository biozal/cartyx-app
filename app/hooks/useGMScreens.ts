import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listGMScreens,
  getGMScreen,
  createGMScreen,
  renameGMScreen,
  deleteGMScreen,
  reorderGMScreens,
  openWindow,
  updateWindow,
  closeWindow,
  createStack,
  renameStack,
  moveStack,
  deleteStack,
  addStackItem,
  removeStackItem,
} from '~/server/functions/gmscreens'
import type { GMScreenData, GMScreenDetailData } from '~/server/functions/gmscreens'
import type { WindowState } from '~/server/db/models/GMScreen'
import { captureException } from '~/providers/PostHogProvider'
import { queryKeys } from '~/utils/queryKeys'

// ---------------------------------------------------------------------------
// List screens for a campaign
// ---------------------------------------------------------------------------

export function useGMScreenList(campaignId: string) {
  const { data: screens = [], isLoading, error } = useQuery({
    queryKey: queryKeys.gmscreens.list(campaignId),
    queryFn: () => listGMScreens({ data: { campaignId } }),
    enabled: !!campaignId,
  })
  return {
    screens,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

// ---------------------------------------------------------------------------
// Get a single screen with hydrated detail
// ---------------------------------------------------------------------------

export function useGMScreenDetail(campaignId: string, screenId: string | null) {
  const { data: screen = null, isLoading, error } = useQuery({
    queryKey: queryKeys.gmscreens.detail(campaignId, screenId ?? ''),
    queryFn: () => getGMScreen({ data: { id: screenId!, campaignId } }),
    enabled: !!campaignId && !!screenId,
  })
  return {
    screen,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useGMScreenMutations(campaignId: string) {
  const queryClient = useQueryClient()

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.list(campaignId) })

  const invalidateDetail = (screenId: string) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.detail(campaignId, screenId) })

  // --- Screen CRUD ---

  const createScreenMutation = useMutation({
    mutationFn: (name: string) => createGMScreen({ data: { campaignId, name } }),
    onSuccess: () => { invalidateList() },
    onError: (e) => { captureException(e, { action: 'createGMScreen' }) },
  })

  const renameScreenMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameGMScreen({ data: { id, campaignId, name } }),
    onSuccess: () => { invalidateList() },
    onError: (e) => { captureException(e, { action: 'renameGMScreen' }) },
  })

  const deleteScreenMutation = useMutation({
    mutationFn: (id: string) => deleteGMScreen({ data: { id, campaignId } }),
    onSuccess: () => { invalidateList() },
    onError: (e) => { captureException(e, { action: 'deleteGMScreen' }) },
  })

  const reorderScreensMutation = useMutation({
    mutationFn: (screenIds: string[]) => reorderGMScreens({ data: { campaignId, screenIds } }),
    onSuccess: () => { invalidateList() },
    onError: (e) => { captureException(e, { action: 'reorderGMScreens' }) },
  })

  // --- Window lifecycle ---

  const openWindowMutation = useMutation({
    mutationFn: ({ screenId, collection, documentId }: { screenId: string; collection: string; documentId: string }) =>
      openWindow({ data: { screenId, campaignId, collection, documentId } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'openWindow' }) },
  })

  const updateWindowMutation = useMutation({
    mutationFn: (params: {
      screenId: string
      windowId: string
      x?: number | null
      y?: number | null
      width?: number | null
      height?: number | null
      zIndex?: number
      state?: WindowState
    }) => {
      const { screenId, windowId, ...fields } = params
      return updateWindow({ data: { screenId, campaignId, windowId, ...fields } })
    },
    // Don't invalidate on every drag/resize — handled via debounce
  })

  const closeWindowMutation = useMutation({
    mutationFn: ({ screenId, windowId }: { screenId: string; windowId: string }) =>
      closeWindow({ data: { screenId, campaignId, windowId } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'closeWindow' }) },
  })

  // --- Stack lifecycle ---

  const createStackMutation = useMutation({
    mutationFn: ({ screenId, name }: { screenId: string; name: string }) =>
      createStack({ data: { screenId, campaignId, name } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'createStack' }) },
  })

  const renameStackMutation = useMutation({
    mutationFn: ({ screenId, stackId, name }: { screenId: string; stackId: string; name: string }) =>
      renameStack({ data: { screenId, campaignId, stackId, name } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'renameStack' }) },
  })

  const moveStackMutation = useMutation({
    mutationFn: ({ screenId, stackId, x, y }: { screenId: string; stackId: string; x: number; y: number }) =>
      moveStack({ data: { screenId, campaignId, stackId, x, y } }),
    // Don't invalidate on every move — handled via debounce
  })

  const deleteStackMutation = useMutation({
    mutationFn: ({ screenId, stackId }: { screenId: string; stackId: string }) =>
      deleteStack({ data: { screenId, campaignId, stackId } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'deleteStack' }) },
  })

  const addStackItemMutation = useMutation({
    mutationFn: (params: { screenId: string; stackId: string; collection: string; documentId: string; label: string }) =>
      addStackItem({ data: { screenId: params.screenId, campaignId, stackId: params.stackId, collection: params.collection, documentId: params.documentId, label: params.label } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'addStackItem' }) },
  })

  const removeStackItemMutation = useMutation({
    mutationFn: ({ screenId, stackId, itemId }: { screenId: string; stackId: string; itemId: string }) =>
      removeStackItem({ data: { screenId, campaignId, stackId, itemId } }),
    onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
    onError: (e) => { captureException(e, { action: 'removeStackItem' }) },
  })

  return {
    createScreen: createScreenMutation,
    renameScreen: renameScreenMutation,
    deleteScreen: deleteScreenMutation,
    reorderScreens: reorderScreensMutation,
    openWindow: openWindowMutation,
    updateWindow: updateWindowMutation,
    closeWindow: closeWindowMutation,
    createStack: createStackMutation,
    renameStack: renameStackMutation,
    moveStack: moveStackMutation,
    deleteStack: deleteStackMutation,
    addStackItem: addStackItemMutation,
    removeStackItem: removeStackItemMutation,
    invalidateDetail,
  }
}

export type { GMScreenData, GMScreenDetailData }
