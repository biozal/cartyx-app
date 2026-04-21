import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useTabletopScreenList,
  useTabletopScreenDetail,
  useTabletopMutations,
} from '~/hooks/useTabletopScreens';
import { useTabletopPlayerState } from '~/hooks/useTabletopPlayerState';
import { useTabletopParty } from '~/hooks/useTabletopParty';
import { TabletopTabBar } from './TabletopTabBar';
import { TabletopCanvas } from './TabletopCanvas';
import {
  FloatingWindowManager,
  type ManagedWindow,
} from '~/components/mainview/FloatingWindowManager';
import type { TabletopMessage } from '~/types/tabletop';
import type { PingData } from './PingOverlay';

// ---------------------------------------------------------------------------
// Dialog state (mirrors GMScreenDialogs pattern)
// ---------------------------------------------------------------------------

type DialogState =
  | { type: 'none' }
  | { type: 'create-tab' }
  | { type: 'rename-tab'; screenId: string; currentName: string }
  | { type: 'delete-tab'; screenId: string; screenName: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TabletopViewProps {
  campaignId: string;
  isGM: boolean;
  getToken: () => Promise<string>;
  sessionId: string | null;
}

export function TabletopView({
  campaignId,
  isGM,
  getToken,
  sessionId: _sessionId,
}: TabletopViewProps) {
  const { screens, isLoading } = useTabletopScreenList(campaignId);
  const mutations = useTabletopMutations(campaignId);
  const { playerState, updateState } = useTabletopPlayerState(campaignId);

  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [badgeScreenIds, setBadgeScreenIds] = useState<Set<string>>(new Set());
  const [_pings, setPings] = useState<PingData[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });

  // Ref guard to prevent double auto-creation of default screen
  const autoCreatedRef = useRef(false);

  // Initialize active screen from player state or first screen
  useEffect(() => {
    if (activeScreenId) return;
    if (playerState?.activeScreenId) {
      setActiveScreenId(playerState.activeScreenId);
    } else if (screens.length > 0) {
      setActiveScreenId(screens[0].id);
    }
  }, [screens, playerState, activeScreenId]);

  // Auto-create default "Tabletop" screen when list is empty and user is GM
  useEffect(() => {
    if (isLoading) return;
    if (!isGM) return;
    if (screens.length > 0) return;
    if (autoCreatedRef.current) return;

    autoCreatedRef.current = true;
    mutations.createScreen
      .mutateAsync('Tabletop')
      .then((result) => {
        if (result?.success) {
          setActiveScreenId(result.screen.id);
          mutations.invalidateList();
        }
      })
      .catch(() => {
        // Reset guard so user can retry
        autoCreatedRef.current = false;
      });
  }, [isLoading, isGM, screens.length, mutations]);

  // Fetch detail for active screen
  const { screen: activeScreen } = useTabletopScreenDetail(campaignId, activeScreenId);

  // Handle ping expired (used when PingOverlay is wired in)
  const _handlePingExpired = useCallback((id: string) => {
    setPings((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // PartyKit message handler
  const handleMessage = useCallback(
    (msg: TabletopMessage) => {
      switch (msg.type) {
        case 'tab:create':
          mutations.invalidateList();
          break;
        case 'tab:rename':
        case 'tab:delete':
          mutations.invalidateList();
          break;
        case 'tab:focus-all':
          setActiveScreenId(msg.screenId);
          break;
        case 'tab:content-added':
          if (msg.screenId !== activeScreenId) {
            setBadgeScreenIds((prev) => new Set([...prev, msg.screenId]));
          }
          break;
        case 'window:show':
        case 'window:close':
          if (msg.screenId === activeScreenId) {
            mutations.invalidateDetail(msg.screenId);
          }
          break;
        case 'ping':
          setPings((prev) => [
            ...prev,
            {
              id: `${msg.userId}-${Date.now()}`,
              x: msg.x,
              y: msg.y,
              userName: msg.userName,
              color: msg.color,
              createdAt: Date.now(),
            },
          ]);
          break;
        case 'grid:style-change':
          if (msg.screenId === activeScreenId) {
            mutations.invalidateDetail(msg.screenId);
          }
          break;
      }
    },
    [activeScreenId, mutations]
  );

  const { send } = useTabletopParty(campaignId, getToken, handleMessage);

  // Handle tab change
  const handleScreenChange = (screenId: string) => {
    setActiveScreenId(screenId);
    setBadgeScreenIds((prev) => {
      const next = new Set(prev);
      next.delete(screenId);
      return next;
    });
    updateState.mutate({ activeScreenId: screenId });
  };

  // Handle create screen (via dialog)
  const handleCreateScreen = async (name: string) => {
    const result = await mutations.createScreen.mutateAsync(name);
    if (result.success) {
      await mutations.invalidateList();
      setActiveScreenId(result.screen.id);
      send({ type: 'tab:create', screen: result.screen });
    }
    setDialog({ type: 'none' });
  };

  // Handle rename screen (via dialog)
  const handleRenameScreen = async (name: string) => {
    if (dialog.type !== 'rename-tab') return;
    await mutations.renameScreen.mutateAsync({ id: dialog.screenId, name });
    send({ type: 'tab:rename', screenId: dialog.screenId, name });
    setDialog({ type: 'none' });
  };

  // Handle delete screen (via dialog)
  const handleDeleteScreen = async () => {
    if (dialog.type !== 'delete-tab') return;
    const deletingId = dialog.screenId;
    const idx = screens.findIndex((s) => s.id === deletingId);
    const nextScreen = screens[idx + 1] ?? screens[idx - 1] ?? null;
    setActiveScreenId(nextScreen?.id ?? null);

    await mutations.deleteScreen.mutateAsync(deletingId);
    mutations.invalidateList();
    send({ type: 'tab:delete', screenId: deletingId });
    setDialog({ type: 'none' });
  };

  // Handle focus all
  const handleFocusAll = () => {
    if (activeScreenId) {
      send({ type: 'tab:focus-all', screenId: activeScreenId });
    }
  };

  // Build floating windows from active screen
  const managedWindows: ManagedWindow[] = (activeScreen?.windows ?? []).map((w) => {
    const hydrated = activeScreen?.hydrated[`${w.collection}:${w.documentId}`];
    return {
      id: w.id,
      title: hydrated?.title ?? 'Loading...',
      content: (
        <div className="p-3 text-sm text-slate-300 whitespace-pre-wrap">
          {hydrated?.content ?? ''}
        </div>
      ),
      position: w.x != null && w.y != null ? { x: w.x, y: w.y } : undefined,
      size: w.width != null && w.height != null ? { width: w.width, height: w.height } : undefined,
      state: w.state === 'minimized' ? ('minimized' as const) : ('normal' as const),
      zIndex: w.zIndex,
    };
  });

  const handleWindowsChange = (_windows: ManagedWindow[]) => {
    // In Phase 1, window layout changes can be persisted later
    // For now, the FloatingWindowManager handles local state
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="tabletop-view">
        <p className="text-xs text-slate-500">Loading tabletop...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="tabletop-view">
      <TabletopTabBar
        screens={screens}
        activeScreenId={activeScreenId}
        onSelectScreen={handleScreenChange}
        onCreateScreen={() => setDialog({ type: 'create-tab' })}
        onRenameScreen={(id) => {
          const s = screens.find((s) => s.id === id);
          if (s) setDialog({ type: 'rename-tab', screenId: id, currentName: s.name });
        }}
        onDeleteScreen={(id) => {
          const s = screens.find((s) => s.id === id);
          if (s) setDialog({ type: 'delete-tab', screenId: id, screenName: s.name });
        }}
        onFocusAll={handleFocusAll}
        isGM={isGM}
        badgeScreenIds={badgeScreenIds}
      />

      <div className="relative flex-1 overflow-hidden">
        <TabletopCanvas screen={activeScreen} />

        <FloatingWindowManager windows={managedWindows} onWindowsChange={handleWindowsChange} />
      </div>

      {/* Dialogs */}
      {dialog.type === 'create-tab' && (
        <TabletopDialog
          title="New Tab"
          placeholder="Tab name"
          defaultValue=""
          confirmLabel="Create"
          onConfirm={handleCreateScreen}
          onDismiss={() => setDialog({ type: 'none' })}
        />
      )}
      {dialog.type === 'rename-tab' && (
        <TabletopDialog
          title="Rename Tab"
          placeholder="Tab name"
          defaultValue={dialog.currentName}
          confirmLabel="Rename"
          onConfirm={handleRenameScreen}
          onDismiss={() => setDialog({ type: 'none' })}
        />
      )}
      {dialog.type === 'delete-tab' && (
        <TabletopConfirmDialog
          title="Delete Tab"
          message={`Are you sure you want to delete "${dialog.screenName}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteScreen}
          onDismiss={() => setDialog({ type: 'none' })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple inline dialogs
// ---------------------------------------------------------------------------

interface TabletopDialogProps {
  title: string;
  placeholder: string;
  defaultValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onDismiss: () => void;
}

function TabletopDialog({
  title,
  placeholder,
  defaultValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: TabletopDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-white/[0.07] bg-[#0D1117] p-4 shadow-xl">
        <h2 className="font-sans text-sm font-semibold text-slate-200 mb-3">{title}</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded border border-white/10 bg-[#161B22] px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TabletopConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

function TabletopConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onDismiss,
}: TabletopConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-white/[0.07] bg-[#0D1117] p-4 shadow-xl">
        <h2 className="font-sans text-sm font-semibold text-slate-200 mb-2">{title}</h2>
        <p className="font-sans text-xs text-slate-400 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
