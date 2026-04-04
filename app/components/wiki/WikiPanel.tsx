import React, { useState } from 'react'
import { Users } from 'lucide-react'
import { CharactersPanel } from './characters/CharactersPanel'

type WikiCategoryId = 'characters'

interface WikiCategory {
  id: WikiCategoryId
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const WIKI_CATEGORIES: WikiCategory[] = [
  { id: 'characters', label: 'Characters', icon: Users },
]

export function WikiPanel() {
  const [selectedCategory, setSelectedCategory] = useState<WikiCategoryId | null>(null)

  return (
    <div className="h-full flex flex-col bg-[#080A12] w-full">
      {selectedCategory === null ? (
        <div className="flex-1 overflow-y-auto">
          {WIKI_CATEGORIES.map((category, index) => {
            const Icon = category.icon
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={[
                  'flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-white/[0.05]',
                  index < WIKI_CATEGORIES.length - 1 ? 'border-b border-white/[0.07]' : '',
                ].join(' ')}
              >
                <Icon className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
                <span className="font-sans font-semibold text-xs text-slate-300">
                  {category.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : selectedCategory === 'characters' ? (
        <CharactersPanel onBack={() => setSelectedCategory(null)} />
      ) : null}
    </div>
  )
}
