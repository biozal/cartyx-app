import { useEffect, useState } from 'react'
import { Widget } from '~/components/mainview/Widget'
import { getSessions, type Session } from '~/services/mocks/sessionsService'

export type { Session }

export interface SessionsListWidgetProps {
  sessions?: Session[]
}

export function SessionsListWidget({ sessions }: SessionsListWidgetProps) {
  const [resolvedSessions, setResolvedSessions] = useState<Session[]>(sessions ?? [])

  useEffect(() => {
    if (sessions) {
      setResolvedSessions(sessions)
      return
    }

    let isMounted = true

    void getSessions().then((nextSessions) => {
      if (isMounted) {
        setResolvedSessions(nextSessions)
      }
    })

    return () => {
      isMounted = false
    }
  }, [sessions])

  return (
    <Widget title="Sessions">
      {resolvedSessions.length === 0 ? (
        <p className="font-pixel text-xs text-slate-500">No sessions recorded</p>
      ) : (
        <div data-testid="sessions-scroll" className="max-h-[400px] overflow-y-auto">
          {resolvedSessions.map((session) => (
            <article
              key={session.id}
              className="border-b border-white/[0.07] py-3 last:border-b-0 first:pt-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 font-pixel text-xs">
                  <p className="text-slate-500">#{session.number}</p>
                  <h3 className="truncate font-bold text-white">{session.name}</h3>
                  <p className="mt-1 text-slate-400">{session.summary}</p>
                </div>

                <p className="shrink-0 text-right font-pixel text-xs text-slate-500">
                  {session.date}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Widget>
  )
}
