import React from 'react';
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

  return <CharacterWindow character={character} onEdit={onEdit} />;
}
