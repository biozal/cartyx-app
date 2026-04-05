import React from 'react';
import { Pencil } from 'lucide-react';
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow';
import { CharacterModal } from '~/components/wiki/characters/CharacterModal';
import { useCharacter } from '~/hooks/useCharacters';
import { useCampaign } from '~/hooks/useCampaigns';

export function EditCharacterModalWrapper({
  campaignId,
  characterId,
  onClose,
}: {
  campaignId: string;
  characterId: string;
  onClose: () => void;
}) {
  const { campaign } = useCampaign(campaignId);
  const sessions = campaign?.sessions ?? [];
  return (
    <CharacterModal
      isOpen
      onClose={onClose}
      campaignId={campaignId}
      characterId={characterId}
      sessions={sessions}
    />
  );
}

export function CharacterWindowWrapper({
  characterId,
  campaignId,
  onEdit,
}: {
  characterId: string;
  campaignId: string;
  onEdit: () => void;
}) {
  const { character, isLoading } = useCharacter(characterId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Character not found</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {character.canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
          aria-label="Edit character"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <CharacterWindow character={character} />
    </div>
  );
}
