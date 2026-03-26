import { Map } from 'lucide-react'

export function TabletopView() {
  return (
    <div
      data-testid="tabletop-view"
      className="flex h-full flex-col items-center justify-center"
    >
      <Map className="mb-4 h-12 w-12 text-slate-700" />
      <h2 className="font-pixel text-sm text-slate-600">Tabletop</h2>
      <p className="mt-1 font-pixel text-xs text-slate-700">Coming Soon</p>
    </div>
  )
}
