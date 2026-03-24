import React from 'react'
import { PartyMemberChip } from './PartyMemberChip'

interface Member {
  id: string
  characterName: string
  characterClass: string
  avatar: string | null
}

interface PartyMemberListProps {
  members: Member[]
  maxPlayers: number
}

export function PartyMemberList({ members, maxPlayers }: PartyMemberListProps) {
  const capped = members.slice(0, 10)
  const remainingOpenSlots = Math.max(0, maxPlayers - members.length)
  const availableVisualSlots = Math.max(0, 10 - capped.length)
  const openSlots = Math.min(remainingOpenSlots, availableVisualSlots)

  if (capped.length === 0 && openSlots === 0) return null

  return (
    <div>
      <div className="text-[10px] font-pixel text-slate-500 tracking-wide mb-2">PARTY</div>
      <div className="flex flex-wrap gap-2">
        {capped.map((m) => (
          <PartyMemberChip
            key={m.id}
            characterName={m.characterName}
            characterClass={m.characterClass}
            avatar={m.avatar}
          />
        ))}
        {Array.from({ length: openSlots }).map((_, i) => (
          <div
            key={`open-${i}`}
            className="flex items-center gap-2.5 bg-white/[0.02] border border-dashed border-white/[0.05] rounded-lg px-3 py-2"
          >
            <div className="w-10 h-10 rounded-md border border-white/[0.05] flex-shrink-0 flex items-center justify-center">
              <span className="text-lg opacity-30">+</span>
            </div>
            <div className="text-[10px] font-pixel text-slate-700">OPEN SLOT</div>
          </div>
        ))}
      </div>
    </div>
  )
}
