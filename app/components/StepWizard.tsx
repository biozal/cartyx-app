import React from 'react'

/** Props for the StepWizard component. */
export interface StepWizardProps {
  /** Array of step label strings. */
  steps: string[]
  /** 1-based index of the currently active step. */
  currentStep: number
  /** Optional callback when a step circle is clicked. */
  onStepClick?: (step: number) => void
}

export function StepWizard({ steps, currentStep, onStepClick }: StepWizardProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center mb-2.5">
        {steps.map((label, i) => (
          <React.Fragment key={i}>
            <button
              type="button"
              onClick={() => onStepClick?.(i + 1)}
              aria-label={`Go to Step ${i + 1}: ${label}`}
              aria-current={i + 1 === currentStep ? 'step' : undefined}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                i + 1 === currentStep
                  ? 'bg-gradient-to-br from-blue-700 to-blue-500 text-white shadow-lg shadow-blue-500/40'
                  : i + 1 < currentStep
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/40'
                  : 'bg-white/5 text-slate-600 border border-white/[0.08]'
              }`}
            >
              {i + 1}
            </button>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 transition-colors ${
                  i + 1 < currentStep ? 'bg-blue-500/40' : 'bg-white/[0.06]'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between">
        {steps.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className={`font-pixel text-[5px] w-8 text-center leading-relaxed transition-colors ${
              i + 1 === currentStep
                ? 'text-blue-400'
                : i + 1 < currentStep
                ? 'text-blue-600'
                : 'text-slate-700'
            }`}
          >
            {label.split(' ').map((w, j) => (
              <span key={j} className="block">
                {w}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}
