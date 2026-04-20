import { createContext, useContext, type ReactNode } from 'react';
import { useActivePlayer } from '~/hooks/usePlayers';
import type { PlayerData } from '~/types/player';

interface ActivePlayerContextValue {
  activePlayer: PlayerData | null;
  isLoading: boolean;
}

const ActivePlayerContext = createContext<ActivePlayerContextValue>({
  activePlayer: null,
  isLoading: true,
});

export function ActivePlayerProvider({
  campaignId,
  children,
}: {
  campaignId: string;
  children: ReactNode;
}) {
  const { player: activePlayer, isLoading } = useActivePlayer(campaignId);

  return (
    <ActivePlayerContext.Provider value={{ activePlayer, isLoading }}>
      {children}
    </ActivePlayerContext.Provider>
  );
}

export function useActivePlayerContext() {
  return useContext(ActivePlayerContext);
}
