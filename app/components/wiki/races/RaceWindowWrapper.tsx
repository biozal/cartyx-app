import { Pencil } from 'lucide-react';
import { RaceWindow } from './RaceWindow';
import { RaceModal } from './RaceModal';
import { useRace } from '~/hooks/useRaces';

export function EditRaceModalWrapper({
  campaignId,
  raceId,
  onClose,
}: {
  campaignId: string;
  raceId: string;
  onClose: () => void;
}) {
  return (
    <RaceModal
      isOpen
      onClose={onClose}
      campaignId={campaignId}
      raceId={raceId}
    />
  );
}

export function RaceWindowWrapper({
  raceId,
  campaignId,
  onEdit,
}: {
  raceId: string;
  campaignId: string;
  onEdit: () => void;
}) {
  const { race, isLoading } = useRace(raceId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading race...</p>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Race not found</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {race.canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
          aria-label="Edit race"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <RaceWindow race={race} />
    </div>
  );
}
