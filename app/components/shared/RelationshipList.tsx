import React from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useCharacters } from '~/hooks/useCharacters';
import type { PictureCrop } from '~/types/character';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipListProps {
  relationships: Array<{ characterId: string; descriptor: string; isPublic: boolean }>;
  campaignId: string;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (characterId: string) => void;
  onRemove: (characterId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers (reuse the same avatar approach from Character/PlayerWindow)
// ---------------------------------------------------------------------------

const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
  ['#14b8a6', '#3b82f6'],
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0).toUpperCase();
  const l = lastName.charAt(0).toUpperCase();
  return l ? `${f}${l}` : f;
}

function getCropStyle(crop: PictureCrop): React.CSSProperties {
  const centerX = (crop.x + crop.width / 2) * 100;
  const centerY = (crop.y + crop.height / 2) * 100;
  const scale = 1 / crop.width;
  return {
    objectPosition: `${centerX}% ${centerY}%`,
    transform: `scale(${scale})`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationshipList({
  relationships,
  campaignId,
  canManage,
  onAdd,
  onEdit,
  onRemove,
}: RelationshipListProps) {
  const { characters } = useCharacters(campaignId);

  const characterMap = React.useMemo(() => {
    const map = new Map<
      string,
      { firstName: string; lastName: string; picture: string; pictureCrop: PictureCrop | null }
    >();
    for (const c of characters) {
      map.set(c.id, {
        firstName: c.firstName,
        lastName: c.lastName,
        picture: c.picture,
        pictureCrop: c.pictureCrop,
      });
    }
    return map;
  }, [characters]);

  return (
    <div className="flex flex-col gap-2">
      {canManage && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mb-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Relationship
        </button>
      )}

      {relationships.length === 0 && (
        <p className="text-xs text-slate-500">No relationships yet.</p>
      )}

      {relationships.map((rel) => {
        const charInfo = characterMap.get(rel.characterId);
        const firstName = charInfo?.firstName ?? 'Unknown';
        const lastName = charInfo?.lastName ?? '';
        const fullName = `${firstName} ${lastName}`.trim();
        const initials = getInitials(firstName, lastName);
        const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length;
        const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]!;

        return (
          <div
            key={rel.characterId}
            className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={
                charInfo?.picture
                  ? undefined
                  : { background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }
              }
            >
              {charInfo?.picture ? (
                <img
                  src={charInfo.picture}
                  alt={fullName}
                  className="w-full h-full object-cover"
                  style={charInfo.pictureCrop ? getCropStyle(charInfo.pictureCrop) : undefined}
                />
              ) : (
                <span className="text-[10px] text-white font-semibold">{initials}</span>
              )}
            </div>

            {/* Name + descriptor */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-200 truncate">{fullName}</p>
              <p className="text-[11px] text-blue-400 truncate">{rel.descriptor}</p>
            </div>

            {/* Public / Private badge */}
            {rel.isPublic ? (
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                Public
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                Private
              </span>
            )}

            {/* Action buttons */}
            {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(rel.characterId)}
                  className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
                  aria-label={`Edit relationship with ${fullName}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(rel.characterId)}
                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-white/[0.05] transition-colors"
                  aria-label={`Remove relationship with ${fullName}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
