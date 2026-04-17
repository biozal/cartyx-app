import { Loader2 } from 'lucide-react';
import { usePlayer } from '~/hooks/usePlayers';
import { PlayerWindow } from './PlayerWindow';
import { PlayerModal } from './PlayerModal';

export function EditPlayerModalWrapper({
  campaignId,
  playerId,
  onClose,
}: {
  campaignId: string;
  playerId: string;
  onClose: () => void;
}) {
  return <PlayerModal campaignId={campaignId} playerId={playerId} onClose={onClose} />;
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
