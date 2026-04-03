import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Layers, Loader2, AlertTriangle } from 'lucide-react'
import { useGMScreenList, useGMScreenDetail, useGMScreenMutations } from '~/hooks/useGMScreens'
import type { GMScreenData } from '~/hooks/useGMScreens'
import { FloatingWindowManager, type ManagedWindow } from '~/components/mainview/FloatingWindowManager'
import type { FloatingWindowState } from '~/components/mainview/FloatingWindow'
import type { WindowState } from '~/server/db/models/GMScreen'
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

export function GMScreensView({ campaignId }: GMScreensViewProps) {
  const { screens, isLoading: listLoading, error: listError } = useGMScreenList(campaignId)
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const mutations = useGMScreenMutations(campaignId)

  // Auto-select first screen on load or when screens change
  useEffect(() => {
    if (screens.length === 0) {
      setActiveScreenId(null)
      return
    }
    // If current active is still valid, keep it
    if (activeScreenId && screens.some(s => s.id === activeScreenId)) return
    // Otherwise, select first
    setActiveScreenId(screens[0].id)
  }, [screens, activeScreenId])

  const { screen: activeScreen, isLoading: detailLoading, error: detailError } =
    useGMScreenDetail(campaignId, activeScreenId)

  // --- Debounced persistence refs ---
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Screen CRUD handlers ---

  const handleCreateScreen = useCallback(async (name: string) => {
    const result = await mutations.createScreen.mutateAsync(name)
    if (result?.screen) {
      setActiveScreenId(result.screen.id)
    }
    setDialog({ type: 'none' })
  }, [mutations.createScreen])

  const handleRenameScreen = useCallback(async (name: string) => {
    if (dialog.type !== 'rename-screen') return
    await mutations.renameScreen.mutateAsync({ id: dialog.screenId, name })
    setDialog({ type: 'none' })
  }, [dialog, mutations.renameScreen])

  const handleDeleteScreen = useCallback(async () => {
    if (dialog.type !== 'delete-screen') return
    const result = await mutations.deleteScreen.mutateAsync(dialog.screenId)
    // Move to next screen by order
    if (result?.remaining && result.remaining.length > 0) {
      const deletedOrder = result.deletedTabOrder ?? 0
      const next = result.remaining.find((s: GMScreenData) => s.tabOrder >= deletedOrder) ?? result.remaining[0]
      setActiveScreenId(next.id)
    }
    setDialog({ type: 'none' })
  }, [dialog, mutations.deleteScreen])

  const handleReorder = useCallback(async (screenIds: string[]) => {
    await mutations.reorderScreens.mutateAsync(screenIds)
    setDialog({ type: 'none' })
  }, [mutations.reorderScreens])

  // --- Window handlers ---

  const handleWindowsChange = useCallback((nextWindows: ManagedWindow[]) => {
    if (!activeScreenId || !activeScreen) return

    // Persist changes debounced
    for (const nw of nextWindows) {
      const orig = activeScreen.windows.find(w => w.id === nw.id)
      if (!orig) continue

      const hasLayoutChange =
        nw.position?.x !== (orig.x ?? undefined) ||
        nw.position?.y !== (orig.y ?? undefined) ||
        nw.size?.width !== (orig.width ?? undefined) ||
        nw.size?.height !== (orig.height ?? undefined) ||
        nw.zIndex !== orig.zIndex ||
        nw.state !== orig.state

      if (hasLayoutChange) {
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current)
        updateTimerRef.current = setTimeout(() => {
          mutations.updateWindow.mutate({
            screenId: activeScreenId,
            windowId: nw.id,
            x: nw.position?.x ?? null,
            y: nw.position?.y ?? null,
            width: nw.size?.width ?? null,
            height: nw.size?.height ?? null,
            zIndex: nw.zIndex,
            state: toWindowState(nw.state),
          })
        }, DEBOUNCE_MS)
      }
    }

    // Handle closes
    const nextIds = new Set(nextWindows.map(w => w.id))
    for (const w of activeScreen.windows) {
      if (!nextIds.has(w.id)) {
        mutations.closeWindow.mutate({ screenId: activeScreenId, windowId: w.id })
      }
    }
  }, [activeScreenId, activeScreen, mutations])

  const handleOpenItem = useCallback((collection: string, documentId: string) => {
    if (!activeScreenId) return
    mutations.openWindow.mutate({ screenId: activeScreenId, collection, documentId })
  }, [activeScreenId, mutations.openWindow])

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

  // --- Build managed windows from screen detail ---

  const managedWindows: ManagedWindow[] = activeScreen
    ? activeScreen.windows.map((w) => {
        const key = `${w.collection}:${w.documentId}`
        const doc = activeScreen.hydrated[key]
        const title = doc?.title || key

        return {
          id: w.id,
          title,
          position: w.x != null && w.y != null ? { x: w.x, y: w.y } : undefined,
          size: w.width != null && w.height != null ? { width: w.width, height: w.height } : undefined,
          state: toFloatingState(w.state),
          zIndex: w.zIndex,
          content: (
            <div className="p-4 font-sans text-xs text-slate-400">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">{w.collection}</p>
              <p className="text-slate-300">{title}</p>
            </div>
          ),
        }
      })
    : []

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
        id="gmscreen-workspace"
        role="tabpanel"
        className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_38%),linear-gradient(180deg,#111827_0%,#0D1117_100%)]"
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
              windows={managedWindows}
              onWindowsChange={handleWindowsChange}
            />

            {/* Stacks — mobile: scrollable list; desktop: absolutely positioned */}
            <div className="pointer-events-none absolute inset-0 lg:pointer-events-auto">
              {/* Mobile stacks — bottom scrollable row */}
              <div className="pointer-events-auto flex gap-2 overflow-x-auto p-2 lg:hidden">
                {activeScreen.stacks.map((stack) => (
                  <StackCard
                    key={stack.id}
                    stack={stack}
                    hydrated={activeScreen.hydrated}
                    onRename={handleRenameStack}
                    onDelete={handleDeleteStack}
                    onMove={() => {}} // No drag on mobile
                    onRemoveItem={handleRemoveStackItem}
                    onOpenItem={handleOpenItem}
                  />
                ))}
              </div>

              {/* Desktop stacks — positioned */}
              <div className="hidden lg:block">
                {activeScreen.stacks.map((stack) => (
                  <StackCard
                    key={stack.id}
                    stack={stack}
                    hydrated={activeScreen.hydrated}
                    onRename={handleRenameStack}
                    onDelete={handleDeleteStack}
                    onMove={(stackId, x, y) => {
                      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
                      moveTimerRef.current = setTimeout(() => {
                        mutations.moveStack.mutate({ screenId: activeScreenId!, stackId, x, y })
                      }, DEBOUNCE_MS)
                    }}
                    onRemoveItem={handleRemoveStackItem}
                    onOpenItem={handleOpenItem}
                  />
                ))}
              </div>
            </div>

            {/* Empty state */}
            {activeScreen.windows.length === 0 && activeScreen.stacks.length === 0 && (
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
    </div>
  )
}
