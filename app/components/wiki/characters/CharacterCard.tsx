import { Globe, Lock, ExternalLink } from 'lucide-react'
import type { CharacterListItem } from '~/types/character'

interface CharacterCardProps {
  character: CharacterListItem
  onClick: (character: CharacterListItem) => void
}

const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
  ['#14b8a6', '#3b82f6'],
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0).toUpperCase()
  const l = lastName.charAt(0).toUpperCase()
  return l ? `${f}${l}` : f
}

export function CharacterCard({ character, onClick }: CharacterCardProps) {
  const fullName = `${character.firstName} ${character.lastName}`.trim()
  const initials = getInitials(character.firstName, character.lastName)
  const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length
  const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]

  const infoSegments: string[] = []
  if (character.race) infoSegments.push(character.race)
  if (character.age != null) infoSegments.push(`Age ${character.age}`)
  if (character.location) infoSegments.push(character.location)

  return (
    <div
      role="button"
      tabIndex={0}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-cartyx-document',
          JSON.stringify({
            collection: 'character',
            documentId: character.id,
            title: fullName,
          }),
        )
        e.dataTransfer.effectAllowed = 'copy'
        e.currentTarget.style.opacity = '0.4'
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = ''
      }}
      onClick={() => onClick(character)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(character)
        }
      }}
      className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors group cursor-grab active:cursor-grabbing"
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden mt-0.5"
        style={
          character.picture
            ? undefined
            : { background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }
        }
      >
        {character.picture ? (
          <img
            src={character.picture}
            alt={fullName}
            className="w-full h-full object-cover"
            style={
              character.pictureCrop
                ? {
                    objectPosition: `${character.pictureCrop.x * 100}% ${character.pictureCrop.y * 100}%`,
                  }
                : undefined
            }
          />
        ) : (
          <span className="text-lg text-white font-semibold">{initials}</span>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
            {fullName}
          </span>
          {character.isPublic ? (
            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Public" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Private" />
          )}
          {character.link && (
            <a
              href={character.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
              aria-label="External link"
            >
              <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-400 transition-colors" />
            </a>
          )}
        </div>

        {infoSegments.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            {infoSegments.map((segment, i) => (
              <span key={segment} className="flex items-center gap-1.5">
                {i > 0 && <span className="opacity-40">&middot;</span>}
                <span>{segment}</span>
              </span>
            ))}
          </div>
        )}

        {character.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {character.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
