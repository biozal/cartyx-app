import React from 'react';
import { User } from 'lucide-react';

interface PartyMemberChipProps {
  characterName: string;
  characterClass: string;
  avatar: string | null;
}

export function PartyMemberChip({ characterName, characterClass, avatar }: PartyMemberChipProps) {
  return (
    <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2">
      <div className="w-10 h-10 rounded-md border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center bg-slate-800">
        {avatar ? (
          <img src={avatar} alt={characterName} className="w-full h-full object-cover" />
        ) : (
          <User className="h-5 w-5 text-slate-500" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-sans font-semibold text-slate-200 truncate leading-relaxed">
          {characterName}
        </div>
        <div className="text-xs text-slate-500 truncate">{characterClass}</div>
      </div>
    </div>
  );
}
