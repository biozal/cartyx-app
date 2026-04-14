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
  return <RaceModal isOpen onClose={onClose} campaignId={campaignId} raceId={raceId} />;
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

  return <RaceWindow race={race} onEdit={onEdit} />;
}
