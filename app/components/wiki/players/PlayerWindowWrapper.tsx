import { Loader2 } from 'lucide-react';
import { usePlayer } from '~/hooks/usePlayers';
import { PlayerWindow } from './PlayerWindow';

export function EditPlayerModalWrapper({
  campaignId: _campaignId,
  playerId: _playerId,
  onClose: _onClose,
}: {
  campaignId: string;
  playerId: string;
  onClose: () => void;
}) {
  // Placeholder for now - will be connected to PlayerModal in Task 13
  return null;
}

export function PlayerWindowWrapper({
  playerId,
  campaignId,
  onEdit,
}: {
  playerId: string;
  campaignId: string;
  onEdit: () => void;
}) {
  const { player, isLoading } = usePlayer(playerId, campaignId);

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  if (!player)
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Player not found
      </div>
    );

  return <PlayerWindow player={player} onEdit={onEdit} />;
}
