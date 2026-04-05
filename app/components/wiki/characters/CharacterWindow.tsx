import React, { useState } from 'react'
import { ExternalLink, ChevronDown, Globe, Lock } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { CharacterData } from '~/types/character'
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses'

interface CharacterWindowProps {
  character: CharacterData
  onEdit?: () => void
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

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] border border-white/[0.06] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className="text-xs text-slate-300 font-medium truncate">{value}</p>
    </div>
  )
}

function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-white/[0.06] rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.03] transition-colors"
      >
        {title}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function CharacterWindow({ character, onEdit }: CharacterWindowProps) {
  const fullName = `${character.firstName} ${character.lastName}`.trim()
  const initials = getInitials(character.firstName, character.lastName)
  const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length
  const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]

  const stats: { label: string; value: string }[] = []
  if (character.race) stats.push({ label: 'Race', value: character.race })
  if (character.characterClass) stats.push({ label: 'Class', value: character.characterClass })
  if (character.age != null) stats.push({ label: 'Age', value: String(character.age) })
  if (character.location) stats.push({ label: 'Location', value: character.location })

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Portrait */}
      <div className="flex justify-center">
        <div
          className="w-24 h-24 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
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
            <span className="text-2xl text-white font-semibold">{initials}</span>
          )}
        </div>
      </div>

      {/* Name + link */}
      <div className="flex items-center justify-center gap-2">
        <h2 className="text-sm font-bold text-slate-200 text-center">{fullName}</h2>
        {character.link && (
          <a
            href={character.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label="External link"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-blue-400 transition-colors" />
          </a>
        )}
      </div>

      {/* Visibility badge */}
      <div className="flex justify-center">
        {character.isPublic ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
            <Globe className="h-3 w-3" />
            Public
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
            <Lock className="h-3 w-3" />
            Private
          </span>
        )}
      </div>

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <StatBlock key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Tags */}
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

      {/* Details accordion */}
      {character.notes && (
        <Accordion title="Details" defaultOpen>
          <div className={MARKDOWN_PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.notes}</ReactMarkdown>
          </div>
        </Accordion>
      )}

      {/* GM Notes accordion */}
      {character.gmNotes && (
        <Accordion title="GM Notes">
          <div className={MARKDOWN_PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.gmNotes}</ReactMarkdown>
          </div>
        </Accordion>
      )}
    </div>
  )
}
