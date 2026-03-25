import { Widget } from '../Widget'
import { getPartyMembers, type PartyMember } from '~/services/mocks/partyMembersService'

export interface PartyMembersWidgetProps {
  members?: PartyMember[]
  className?: string
}

export function PartyMembersWidget({
  members = getPartyMembers(),
  className = '',
}: PartyMembersWidgetProps) {
  return (
    <Widget title="Party Members" className={className}>
      {members.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="font-pixel text-xs text-slate-500">No party members found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <article
              key={member.id}
              className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
            >
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={`${member.name} avatar`}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 font-pixel text-xs text-slate-200"
                >
                  {member.name.charAt(0)}
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate font-pixel text-xs text-white">{member.name}</p>
                <p className="font-pixel text-xs text-slate-400">{member.characterClass}</p>
                <p className="font-pixel text-xs text-slate-400">{member.race}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Widget>
  )
}
