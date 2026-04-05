import React, { useState, useCallback, useRef, useEffect, useMemo, type DragEvent } from 'react'
import { Plus, Layers, Loader2, AlertTriangle, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGMScreenList, useGMScreenDetail, useGMScreenMutations } from '~/hooks/useGMScreens'
import { FloatingWindowManager, type ManagedWindow } from '~/components/mainview/FloatingWindowManager'
import type { FloatingWindowState } from '~/components/mainview/FloatingWindow'
import type { WindowState } from '~/types/gmscreen'
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses'
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow'
import { CharacterModal } from '~/components/wiki/characters/CharacterModal'
import { useCharacter } from '~/hooks/useCharacters'
import { useCampaign } from '~/hooks/useCampaigns'
import { ScreenBar } from './ScreenBar'
import { StackCard } from './StackCard'
import { ScreenNameDialog } from './ScreenNameDialog'
import { ReorderDialog } from './ReorderDialog'
import { ConfirmDialog } from './ConfirmDialog'

export interface GMScreensViewProps {
  campaignId: string
}

type DialogState =
  | { type: 'none' }
  | { type: 'create-screen' }
  | { type: 'rename-screen'; screenId: string; currentName: string }
  | { type: 'delete-screen'; screenId: string; screenName: string }
  | { type: 'reorder' }
  | { type: 'create-stack' }

const DEBOUNCE_MS = 500

/** Map FloatingWindow states to backend WindowState values. */
function toWindowState(state: FloatingWindowState): WindowState {
  if (state === 'minimized') return 'minimized'
  if (state === 'maximized') return 'open'
  return 'open'
}

/** Map backend WindowState to FloatingWindow states. */
function toFloatingState(state: string): FloatingWindowState {
  if (state === 'minimized') return 'minimized'
  return 'normal'
}

function EditCharacterModalWrapper({
  campaignId,
  characterId,
  onClose,
}: {
  campaignId: string
  characterId: string
  onClose: () => void
}) {
  const { campaign } = useCampaign(campaignId)
  const sessions = campaign?.sessions ?? []
  return (
    <CharacterModal
      isOpen
      onClose={onClose}
      campaignId={campaignId}
      characterId={characterId}
      sessions={sessions}
    />
  )
}

function CharacterWindowWrapper({
  characterId,
  campaignId,
  onEdit,
}: {
  characterId: string
  campaignId: string
  onEdit: () => void
}) {
  const { character, isLoading } = useCharacter(characterId, campaignId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
      </div>
    )
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Character not found</p>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onEdit}
        className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
        aria-label="Edit character"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <CharacterWindow character={character} />
    </div>
  )
}

export function GMScreensView({ campaignId }: GMScreensViewProps) {
  const { screens, isLoading: listLoading, error: listError } = useGMScreenList(campaignId)
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const mutations = useGMScreenMutations(campaignId)
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [flashWindowId, setFlashWindowId] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)

  // Collision-safe primitive key that tracks the *set* of screen IDs.
  // Sorted so harmless order changes (reorder, query refetch jitter) don't
  // trigger re-runs — only actual additions/removals change this value.
  const screenIdsKey = useMemo(
    () => JSON.stringify([...screens.map(s => s.id)].sort()),
    [screens],
  )

  // Ref to current ordered screens so the auto-select effect can pick the
  // first screen by tab-order without adding `screens` to its dep array.
  const screensRef = useRef(screens)
  screensRef.current = screens

  // Auto-select first screen once the list has settled (not while loading).
  // Uses screenIdsKey (primitive) so it only fires when the set of IDs
  // changes, and a functional update to avoid activeScreenId in deps.
  useEffect(() => {
    if (listLoading) return
    const current = screensRef.current
    if (current.length === 0) {
      setActiveScreenId(null)
      return
    }
    const idSet = new Set(current.map(s => s.id))
    setActiveScreenId(prev => {
      if (prev && idSet.has(prev)) return prev
      return current[0].id
    })
  }, [screenIdsKey, listLoading])

  // Clear drag highlight when switching screens
  useEffect(() => {
    setIsDragOver(false)
    setFlashWindowId(null)
  }, [activeScreenId])

  const { screen: activeScreen, isLoading: detailLoading, error: detailError } =
    useGMScreenDetail(campaignId, activeScreenId)

  // --- Debounced persistence refs ---
  // Per-window timers so multi-window updates don't clobber each other
  const updateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Store pending payloads so they can be flushed on unmount
  const pendingUpdatesRef = useRef<Map<string, Parameters<typeof mutations.updateWindow.mutate>[0]>>(new Map())

  // Flush pending updates on unmount instead of discarding them
  useEffect(() => {
    const timers = updateTimersRef.current
    const pending = pendingUpdatesRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      for (const payload of pending.values()) {
        mutations.updateWindow.mutate(payload)
      }
      pending.clear()
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [mutations])

  // --- Screen CRUD handlers ---

  const handleCreateScreen = useCallback(async (name: string) => {
    const result = await mutations.createScreen.mutateAsync(name)
    if (result?.screen) {
      setActiveScreenId(result.screen.id)
    }
    // Invalidate list AFTER selection is set to prevent the auto-select
    // effect from briefly choosing a different screen during the refetch.
    mutations.invalidateList()
    setDialog({ type: 'none' })
  }, [mutations])

  const handleRenameScreen = useCallback(async (name: string) => {
    if (dialog.type !== 'rename-screen') return
    await mutations.renameScreen.mutateAsync({ id: dialog.screenId, name })
    setDialog({ type: 'none' })
  }, [dialog, mutations.renameScreen])

  const handleDeleteScreen = useCallback(async () => {
    if (dialog.type !== 'delete-screen') return
    const deletingId = dialog.screenId
    const currentScreens = screensRef.current

    // Snapshot the window IDs before changing selection (activeScreen will
    // become stale once activeScreenId changes).
    const windowIds = activeScreen?.windows.map(w => w.id) ?? []

    // Optimistically move selection BEFORE the mutation so activeScreenId
    // never points to a deleted screen (avoids bounce / invalid detail fetch).
    const idx = currentScreens.findIndex(s => s.id === deletingId)
    const nextScreen = currentScreens[idx + 1] ?? currentScreens[idx - 1] ?? null
    setActiveScreenId(nextScreen?.id ?? null)

    // Clear any pending debounced window-update timers for the deleted screen's windows
    const windowIdSet = new Set(windowIds)
    for (const [timerId, timer] of updateTimersRef.current) {
      if (windowIdSet.has(timerId)) {
        clearTimeout(timer)
        updateTimersRef.current.delete(timerId)
      }
    }

    await mutations.deleteScreen.mutateAsync(deletingId)
    // Invalidate list AFTER mutation + selection to avoid race
    mutations.invalidateList()
    setDialog({ type: 'none' })
  }, [dialog, mutations, activeScreen])

  const handleReorder = useCallback(async (screenIds: string[]) => {
    await mutations.reorderScreens.mutateAsync(screenIds)
    setDialog({ type: 'none' })
  }, [mutations.reorderScreens])

  // --- Window handlers ---

  const handleWindowsChange = useCallback((nextWindows: ManagedWindow[]) => {
    // Optimistically update local state immediately
    setLocalWindows(nextWindows)

    if (!activeScreenId || !activeScreen) return

    // Persist changes debounced — one timer per window
    for (const nw of nextWindows) {
      const orig = activeScreen.windows.find(w => w.id === nw.id)
      if (!orig) continue

      const hasLayoutChange =
        nw.position?.x !== (orig.x ?? undefined) ||
        nw.position?.y !== (orig.y ?? undefined) ||
        nw.size?.width !== (orig.width ?? undefined) ||
        nw.size?.height !== (orig.height ?? undefined) ||
        nw.zIndex !== orig.zIndex ||
        toWindowState(nw.state) !== orig.state

      if (hasLayoutChange) {
        const payload = {
          screenId: activeScreenId,
          windowId: nw.id,
          x: nw.position?.x ?? null,
          y: nw.position?.y ?? null,
          width: nw.size?.width ?? null,
          height: nw.size?.height ?? null,
          zIndex: nw.zIndex,
          state: toWindowState(nw.state),
        }
        pendingUpdatesRef.current.set(nw.id, payload)

        const existing = updateTimersRef.current.get(nw.id)
        if (existing) clearTimeout(existing)
        updateTimersRef.current.set(
          nw.id,
          setTimeout(() => {
            updateTimersRef.current.delete(nw.id)
            pendingUpdatesRef.current.delete(nw.id)
            mutations.updateWindow.mutate(payload)
          }, DEBOUNCE_MS),
        )
      }
    }

    // Handle closes — clear pending timers before firing the close mutation
    const nextIds = new Set(nextWindows.map(w => w.id))
    for (const w of activeScreen.windows) {
      if (!nextIds.has(w.id)) {
        const pending = updateTimersRef.current.get(w.id)
        if (pending) {
          clearTimeout(pending)
          updateTimersRef.current.delete(w.id)
        }
        mutations.closeWindow.mutate({ screenId: activeScreenId, windowId: w.id })
      }
    }
  }, [activeScreenId, activeScreen, mutations])

  const handleOpenItem = useCallback((collection: string, documentId: string) => {
    if (!activeScreenId) return
    mutations.openWindow.mutate({ screenId: activeScreenId, collection, documentId })
  }, [activeScreenId, mutations.openWindow])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!activeScreenId) return
    if (!e.dataTransfer.types.includes('application/x-cartyx-document')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [activeScreenId])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the container, not when entering a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)

    if (!activeScreenId || !activeScreen) return

    const raw = e.dataTransfer.getData('application/x-cartyx-document')
    if (!raw) return

    let payload: { collection: string; documentId: string; title: string }
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }

    // Check for duplicate
    const existing = activeScreen.windows.find(
      (w) => w.collection === payload.collection && w.documentId === payload.documentId,
    )

    if (existing) {
      // Focus + flash the existing window
      const maxZ = activeScreen.windows.reduce((max, w) => Math.max(max, w.zIndex), 0)
      mutations.updateWindow.mutate({
        screenId: activeScreenId,
        windowId: existing.id,
        zIndex: maxZ + 1,
        state: 'open',
      })
      setFlashWindowId(existing.id)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null
        setFlashWindowId(null)
      }, 700)
      return
    }

    // Calculate drop position relative to the workspace container
    const rect = workspaceRef.current?.getBoundingClientRect()
    const x = rect ? e.clientX - rect.left : 100
    const y = rect ? e.clientY - rect.top : 100

    mutations.openWindow.mutate({
      screenId: activeScreenId,
      collection: payload.collection,
      documentId: payload.documentId,
      x,
      y,
    })
  }, [activeScreenId, activeScreen, mutations])

  // --- Stack handlers ---

  const handleCreateStack = useCallback(async (name: string) => {
    if (!activeScreenId) return
    await mutations.createStack.mutateAsync({ screenId: activeScreenId, name })
    setDialog({ type: 'none' })
  }, [activeScreenId, mutations.createStack])

  const handleRenameStack = useCallback((stackId: string, name: string) => {
    if (!activeScreenId) return
    mutations.renameStack.mutate({ screenId: activeScreenId, stackId, name })
  }, [activeScreenId, mutations.renameStack])

  const handleDeleteStack = useCallback((stackId: string) => {
    if (!activeScreenId) return
    mutations.deleteStack.mutate({ screenId: activeScreenId, stackId })
  }, [activeScreenId, mutations.deleteStack])

  const handleRemoveStackItem = useCallback((stackId: string, itemId: string) => {
    if (!activeScreenId) return
    mutations.removeStackItem.mutate({ screenId: activeScreenId, stackId, itemId })
  }, [activeScreenId, mutations.removeStackItem])

  // --- Local window state (optimistic) ---
  // Initialized from server, updated optimistically on user interaction,
  // re-synced when server data changes (e.g. after openWindow/closeWindow invalidation).

  const [localWindows, setLocalWindows] = useState<ManagedWindow[]>([])
  const localScreenIdRef = useRef<string | null>(null)

  // Merge server data into local state: add new windows, remove closed ones,
  // but preserve local layout (position/size/zIndex/state) for windows that
  // already exist locally so debounced optimistic updates aren't overwritten
  // by a stale refetch triggered by other mutations (openWindow/closeWindow).
  useEffect(() => {
    if (!activeScreen) {
      setLocalWindows([])
      localScreenIdRef.current = null
      return
    }

    // Full reset when switching screens — local layout belongs to old screen
    const isScreenSwitch = localScreenIdRef.current !== activeScreenId
    localScreenIdRef.current = activeScreenId

    setLocalWindows((prev) => {
      const prevById = isScreenSwitch ? new Map<string, ManagedWindow>() : new Map(prev.map(w => [w.id, w]))
      const serverIds = new Set(activeScreen.windows.map(w => w.id))

      const merged = activeScreen.windows.map((w) => {
        const key = `${w.collection}:${w.documentId}`
        const doc = activeScreen.hydrated[key]
        const title = doc?.title || key
        const markdownContent = doc?.content || ''

        let windowContent: React.ReactNode

        if (w.collection === 'character') {
          windowContent = (
            <CharacterWindowWrapper
              characterId={w.documentId}
              campaignId={campaignId}
              onEdit={() => setEditingCharacterId(w.documentId)}
            />
          )
        } else {
          windowContent = (
            <div className="p-4 overflow-auto h-full">
              <div className={MARKDOWN_PROSE_CLASSES}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
              </div>
            </div>
          )
        }

        const existing = prevById.get(w.id)
        if (existing) {
          // Preserve local layout, update title/content from server
          return {
            ...existing,
            title,
            contentKey: markdownContent,
            className: flashWindowId === existing.id ? 'animate-flash-border' : '',
            content: windowContent,
          }
        }

        // New window from server — use server layout
        return {
          id: w.id,
          title,
          contentKey: markdownContent,
          position: w.x != null && w.y != null ? { x: w.x, y: w.y } : undefined,
          size: w.width != null && w.height != null ? { width: w.width, height: w.height } : undefined,
          state: toFloatingState(w.state),
          zIndex: w.zIndex,
          className: flashWindowId === w.id ? 'animate-flash-border' : '',
          content: windowContent,
        }
      })

      // Only update if the window set or titles changed (avoid unnecessary renders)
      if (
        prev.length === merged.length &&
        prev.every((p, i) => p.id === merged[i].id && p.title === merged[i].title && p.contentKey === merged[i].contentKey && p.className === merged[i].className) &&
        serverIds.size === prev.length
      ) {
        return prev
      }

      return merged
    })
  }, [activeScreen, activeScreenId, flashWindowId])

  // --- Render ---

  if (listLoading) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="gmscreens-loading">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (listError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400" data-testid="gmscreens-error">
        <AlertTriangle className="h-6 w-6 text-red-400" />
        <p className="font-sans text-xs">{listError}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="gmscreens-view">
      <ScreenBar
        screens={screens}
        activeScreenId={activeScreenId}
        onSelectScreen={setActiveScreenId}
        onCreateScreen={() => setDialog({ type: 'create-screen' })}
        onRenameScreen={(id) => {
          const s = screens.find(s => s.id === id)
          if (s) setDialog({ type: 'rename-screen', screenId: id, currentName: s.name })
        }}
        onDeleteScreen={(id) => {
          const s = screens.find(s => s.id === id)
          if (s) setDialog({ type: 'delete-screen', screenId: id, screenName: s.name })
        }}
        onReorderScreens={() => setDialog({ type: 'reorder' })}
      />

      {/* Workspace */}
      <div
        ref={workspaceRef}
        id={activeScreenId ? `gmscreen-tabpanel-${activeScreenId}` : 'gmscreen-tabpanel'}
        role="tabpanel"
        aria-labelledby={activeScreenId ? `screen-tab-${activeScreenId}` : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_38%),linear-gradient(180deg,#111827_0%,#0D1117_100%)]',
          'transition-shadow duration-200',
          isDragOver ? 'ring-2 ring-inset ring-blue-500/40 bg-blue-500/[0.03]' : '',
        ].join(' ')}
      >
        {detailLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : detailError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <p className="font-sans text-xs">{detailError}</p>
          </div>
        ) : activeScreen ? (
          <>
            {/* Floating windows */}
            <FloatingWindowManager
              windows={localWindows}
              onWindowsChange={handleWindowsChange}
            />

            {/* Desktop stacks — absolutely positioned overlay */}
            <div className="pointer-events-none absolute inset-0 hidden lg:block">
              <div className="pointer-events-auto">
                {activeScreen.stacks.map((stack) => (
                  <StackCard
                    key={stack.id}
                    stack={stack}
                    hydrated={activeScreen.hydrated}
                    onRename={handleRenameStack}
                    onDelete={handleDeleteStack}
                    onRemoveItem={handleRemoveStackItem}
                    onOpenItem={handleOpenItem}
                  />
                ))}
              </div>
            </div>

            {/* Mobile stacks — in-flow scrollable row at the bottom */}
            {activeScreen.stacks.length > 0 && (
              <div className="absolute bottom-14 left-0 right-0 z-30 flex gap-2 overflow-x-auto px-2 py-1 lg:hidden">
                {activeScreen.stacks.map((stack) => (
                  <StackCard
                    key={stack.id}
                    stack={stack}
                    hydrated={activeScreen.hydrated}
                    onRename={handleRenameStack}
                    onDelete={handleDeleteStack}
                    onRemoveItem={handleRemoveStackItem}
                    onOpenItem={handleOpenItem}
                    inFlowLayout
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {localWindows.length === 0 && activeScreen.stacks.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Layers className="h-10 w-10 text-slate-700" />
                <p className="font-sans font-semibold text-xs text-slate-600">
                  This screen is empty
                </p>
                <p className="font-sans text-[10px] text-slate-700">
                  Open documents as windows or create stacks to organize
                </p>
              </div>
            )}
          </>
        ) : screens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Layers className="h-10 w-10 text-slate-700" />
            <p className="font-sans font-semibold text-xs text-slate-600">No screens yet</p>
            <button
              type="button"
              onClick={() => setDialog({ type: 'create-screen' })}
              className="font-sans text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Create your first screen
            </button>
          </div>
        ) : null}

        {/* FAB for creating stacks */}
        {activeScreenId && (
          <button
            type="button"
            onClick={() => setDialog({ type: 'create-stack' })}
            aria-label="Create stack"
            data-testid="create-stack-fab"
            className="absolute bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500 active:bg-blue-700 sm:bottom-6 sm:right-6"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Dialogs */}
      {dialog.type === 'create-screen' && (
        <ScreenNameDialog
          title="New Screen"
          initialName=""
          onSubmit={handleCreateScreen}
          onCancel={() => setDialog({ type: 'none' })}
          isLoading={mutations.createScreen.isPending}
          error={mutations.createScreen.error?.message ?? null}
        />
      )}

      {dialog.type === 'rename-screen' && (
        <ScreenNameDialog
          title="Rename Screen"
          initialName={dialog.currentName}
          onSubmit={handleRenameScreen}
          onCancel={() => setDialog({ type: 'none' })}
          isLoading={mutations.renameScreen.isPending}
          error={mutations.renameScreen.error?.message ?? null}
        />
      )}

      {dialog.type === 'delete-screen' && (
        <ConfirmDialog
          title="Delete Screen"
          message={`Are you sure you want to delete "${dialog.screenName}"? This will remove all windows and stacks on this screen.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteScreen}
          onCancel={() => setDialog({ type: 'none' })}
          isLoading={mutations.deleteScreen.isPending}
        />
      )}

      {dialog.type === 'reorder' && (
        <ReorderDialog
          screens={screens}
          onSubmit={handleReorder}
          onCancel={() => setDialog({ type: 'none' })}
          isLoading={mutations.reorderScreens.isPending}
        />
      )}

      {dialog.type === 'create-stack' && (
        <ScreenNameDialog
          title="New Stack"
          initialName=""
          onSubmit={handleCreateStack}
          onCancel={() => setDialog({ type: 'none' })}
          isLoading={mutations.createStack.isPending}
          error={mutations.createStack.error?.message ?? null}
        />
      )}

      {editingCharacterId !== null && (
        <EditCharacterModalWrapper
          campaignId={campaignId}
          characterId={editingCharacterId}
          onClose={() => setEditingCharacterId(null)}
        />
      )}
    </div>
  )
}
