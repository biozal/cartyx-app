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
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Initialize active screen from player state or first screen
  useEffect(() => {
    if (activeScreenId) return;
    if (playerState?.activeScreenId) {
      setActiveScreenId(playerState.activeScreenId);
    } else if (screens.length > 0) {
      setActiveScreenId(screens[0].id);
    }
  }, [screens, playerState, activeScreenId]);

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

  // Handle create screen
  const handleCreateScreen = async (name: string) => {
    const result = await mutations.createScreen.mutateAsync(name);
    if (result.success) {
      await mutations.invalidateList();
      setActiveScreenId(result.screen.id);
      send({ type: 'tab:create', screen: result.screen });
    }
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
        onScreenChange={handleScreenChange}
        onCreateScreen={handleCreateScreen}
        onFocusAll={handleFocusAll}
        isGM={isGM}
        badgeScreenIds={badgeScreenIds}
      />

      <div ref={canvasContainerRef} className="relative flex-1 overflow-hidden">
        <TabletopCanvas screen={activeScreen} containerRef={canvasContainerRef} />

        <FloatingWindowManager windows={managedWindows} onWindowsChange={handleWindowsChange} />
      </div>
    </div>
  );
}
