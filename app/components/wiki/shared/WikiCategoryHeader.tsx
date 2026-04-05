import { ChevronLeft } from 'lucide-react'

interface WikiCategoryHeaderProps {
  title: string
  onBack: () => void
}

export function WikiCategoryHeader({ title, onBack }: WikiCategoryHeaderProps) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onBack}
      className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 font-sans font-semibold text-xs text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white w-full"
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{title}</span>
    </button>
  )
}
