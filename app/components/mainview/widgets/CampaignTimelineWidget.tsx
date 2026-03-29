import { useEffect, useState } from 'react'
import { Widget } from '~/components/mainview/Widget'
import {
  getTimelineEvents,
  type TimelineEvent,
} from '~/services/mocks/timelineService'

export type { TimelineEvent }

export interface CampaignTimelineWidgetProps {
  events?: ReadonlyArray<Readonly<TimelineEvent>>
  className?: string
}

function getEventTone(event: TimelineEvent) {
  if (event.isCurrent) return 'current'
  if (event.importance === 'major') return 'major'
  return 'normal'
}

export function CampaignTimelineWidget({
  events,
  className = '',
}: CampaignTimelineWidgetProps) {
  const [resolvedEvents, setResolvedEvents] = useState<TimelineEvent[] | null>(
    events ? events.map((event) => ({ ...event })) : null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (events) {
      setResolvedEvents(events.map((event) => ({ ...event })))
      setError(null)
      return
    }

    let isMounted = true
    setError(null)

    void getTimelineEvents()
      .then((nextEvents) => {
        if (isMounted) {
          setResolvedEvents(nextEvents)
        }
      })
      .catch((error) => {
        console.error(error)
        if (isMounted) {
          setError('Unable to load timeline.')
          setResolvedEvents([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [events])

  const displayEvents = resolvedEvents ? [...resolvedEvents].reverse() : []

  return (
    <Widget title="Campaign Timeline" className={className}>
      {resolvedEvents === null ? (
        <div className="flex items-center justify-center py-8">
          <p className="font-pixel text-xs text-slate-500">Loading timeline...</p>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-8">
          <p className="font-pixel text-xs text-rose-400">{error}</p>
        </div>
      ) : resolvedEvents.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="font-pixel text-xs text-slate-500">No timeline events</p>
        </div>
      ) : (
        <div
          data-testid="timeline-scroll"
          className="relative overflow-x-auto overflow-y-hidden pb-2"
        >
          <div className="relative min-w-[760px] pt-8">
            <div
              aria-hidden="true"
              className="absolute left-4 right-4 top-4 h-px bg-white/[0.08]"
            />

            <ol className="grid grid-flow-col auto-cols-[minmax(10.5rem,1fr)] gap-4">
              {displayEvents.map((event) => {
                const tone = getEventTone(event)
                const isCurrent = tone === 'current'
                const isMajor = tone === 'major'

                const dotClasses = isCurrent
                  ? 'h-4 w-4 bg-primary ring-[12px] ring-primary/10 animate-pulse'
                  : isMajor
                    ? 'h-4 w-4 bg-blue-light ring-8 ring-blue-light/10'
                    : 'h-3 w-3 bg-slate-500 ring-4 ring-white/[0.05]'

                const dateClasses = isCurrent
                  ? 'text-primary'
                  : isMajor
                    ? 'text-blue-light'
                    : 'text-slate-500'

                const titleClasses = isCurrent
                  ? 'text-white'
                  : isMajor
                    ? 'text-blue-light'
                    : 'text-slate-500'

                const labelClasses = isCurrent
                  ? 'text-primary'
                  : isMajor
                    ? 'text-blue-light'
                    : 'text-slate-600'

                const summaryClasses = isCurrent
                  ? 'text-slate-300'
                  : isMajor
                    ? 'text-slate-300'
                    : 'text-slate-400'

                return (
                  <li
                    key={event.id}
                    data-tone={tone}
                    className="relative min-h-[11rem] px-1 pt-4 text-center"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-1/2 top-4 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full ${dotClasses}`}
                    />

                    <div className="flex h-full flex-col items-center justify-start">
                      <p className={`font-pixel text-[0.6rem] tracking-[0.16em] ${dateClasses}`}>
                        {event.calendarDate}
                      </p>

                      <h3
                        className={`mt-2 max-w-[9rem] font-pixel text-xs font-bold uppercase leading-tight ${titleClasses}`}
                      >
                        {event.sessionName}
                      </h3>

                      {isCurrent ? (
                        <p className={`mt-2 font-pixel text-[0.5rem] font-bold tracking-[0.18em] ${labelClasses}`}>
                          CURRENT SESSION
                        </p>
                      ) : isMajor ? (
                        <p className={`mt-2 font-pixel text-[0.5rem] font-bold tracking-[0.18em] ${labelClasses}`}>
                          MAJOR EVENT
                        </p>
                      ) : null}

                      <p
                        className={`mt-2 max-w-[9rem] text-[0.58rem] leading-relaxed line-clamp-3 ${summaryClasses}`}
                        title={event.summary}
                      >
                        {event.summary}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </Widget>
  )
}
