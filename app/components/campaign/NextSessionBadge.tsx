import React from 'react'
import { formatNextSession } from '~/utils/date'

interface NextSessionBadgeProps {
  nextSession: { day: string; time: string } | null
  schedule: {
    time: string | null
    timezone: string | null
  }
}

export function NextSessionBadge({ nextSession, schedule }: NextSessionBadgeProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-sm mt-0.5">{nextSession ? '🗓' : '⏸'}</span>
      <div>
        <div className="text-[10px] font-sans font-semibold text-slate-500 tracking-wide mb-0.5">NEXT SESSION</div>
        {nextSession ? (
          <div className="text-sm text-slate-300">
            {formatNextSession(nextSession.day, schedule.time, schedule.timezone)}
          </div>
        ) : (
          <div className="text-sm text-slate-600">Not scheduled</div>
        )}
      </div>
    </div>
  )
}
