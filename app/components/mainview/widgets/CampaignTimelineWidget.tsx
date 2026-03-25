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
          className="relative max-h-[500px] overflow-y-auto pr-1"
        >
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-[5px] top-0 border-l border-white/[0.07]"
          />

          <div className="space-y-4">
            {resolvedEvents.map((event) => (
              <article key={event.id} className="relative pl-7">
                <div
                  aria-hidden="true"
                  className="absolute left-[0px] top-1 h-3 w-3 rounded-full bg-[#2563EB]"
                />

                <p className="font-pixel text-xs text-slate-500">{event.calendarDate}</p>
                <h3 className="mt-1 font-pixel text-xs text-white">{event.sessionName}</h3>
                <p className="mt-1 font-pixel text-xs leading-relaxed text-slate-400">
                  {event.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </Widget>
  )
}
