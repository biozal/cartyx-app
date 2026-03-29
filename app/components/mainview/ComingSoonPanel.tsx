export interface ComingSoonPanelProps {
  title: string
  testId: string
}

export function ComingSoonPanel({ title, testId }: ComingSoonPanelProps) {
  return (
    <div data-testid={testId} className="flex h-full w-full flex-col bg-[#080A12]">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <h2 className="font-pixel text-xs text-slate-300">{title}</h2>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <span className="font-pixel text-xs text-slate-500">Coming Soon</span>
      </div>
    </div>
  )
}
