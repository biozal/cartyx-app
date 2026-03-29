import React, { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  Globe,
  Image,
  MapPin,
  Package,
  Scroll,
  Skull,
  StickyNote,
  Users,
  Zap,
} from 'lucide-react'

type WikiCategoryId =
  | 'characters'
  | 'locations'
  | 'organizations'
  | 'lore'
  | 'creatures'
  | 'races'
  | 'calendar'
  | 'events'
  | 'notes'
  | 'quests'
  | 'objects'
  | 'art-gallery'

interface WikiCategory {
  id: WikiCategoryId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const WIKI_CATEGORIES: WikiCategory[] = [
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
  { id: 'lore', label: 'Lore', icon: BookOpen },
  { id: 'creatures', label: 'Creatures', icon: Skull },
  { id: 'races', label: 'Races', icon: Globe },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'events', label: 'Events', icon: Zap },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'quests', label: 'Quests', icon: Scroll },
  { id: 'objects', label: 'Objects', icon: Package },
  { id: 'art-gallery', label: 'Art Gallery', icon: Image },
]

export function WikiPanel() {
  const [selectedCategory, setSelectedCategory] = useState<WikiCategoryId | null>(null)

  return (
    <div className="flex h-full w-full flex-col bg-[#080A12]">
      <div className={selectedCategory ? 'max-h-72 shrink-0 overflow-y-auto' : 'flex-1 overflow-y-auto'}>
        {WIKI_CATEGORIES.map((category, index) => {
          const Icon = category.icon
          const isSelected = category.id === selectedCategory

          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedCategory(category.id)}
              className={[
                'flex w-full items-center px-4 py-3 text-left transition-colors',
                index < WIKI_CATEGORIES.length - 1 ? 'border-b border-white/[0.07]' : '',
                isSelected ? 'bg-white/[0.05] text-white' : 'hover:bg-white/[0.05]',
              ].join(' ')}
            >
              <Icon className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
              <span
                className={`font-pixel text-xs ${
                  isSelected ? 'text-white' : 'text-slate-300'
                }`}
              >
                {category.label}
              </span>
            </button>
          )
        })}
      </div>

      {selectedCategory ? (
        <div className="flex w-full flex-1 flex-col border-t border-white/[0.07]">
          <button
            type="button"
            aria-label="Back"
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 font-pixel text-xs text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          <div className="flex w-full flex-1 items-center justify-center p-4">
            <span className="font-pixel text-xs text-slate-500">
              {WIKI_CATEGORIES.find(category => category.id === selectedCategory)?.label} - Coming
              {' '}Soon
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
