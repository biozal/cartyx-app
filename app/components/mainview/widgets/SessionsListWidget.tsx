import { useEffect, useState } from 'react'
import { Widget } from '~/components/mainview/Widget'
import { getSessions, type Session } from '~/services/mocks/sessionsService'

export type { Session }

export interface SessionsListWidgetProps {
  sessions?: ReadonlyArray<Readonly<Session>>
  className?: string
}

export function SessionsListWidget({ sessions, className = '' }: SessionsListWidgetProps) {
  const [resolvedSessions, setResolvedSessions] = useState<Session[] | null>(
    sessions ? sessions.map((session) => ({ ...session })) : null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessions) {
      setResolvedSessions(sessions.map((session) => ({ ...session })))
      setError(null)
      return
    }

    let isMounted = true
    setError(null)

    void getSessions()
      .then((nextSessions) => {
        if (isMounted) {
          setResolvedSessions(nextSessions)
        }
      })
      .catch((error) => {
        console.error(error)
        if (isMounted) {
          setError('Unable to load sessions.')
          setResolvedSessions([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [sessions])

  return (
    <Widget title="Sessions" className={className}>
      {resolvedSessions === null ? (
        <p className="font-pixel text-xs text-slate-500">Loading sessions...</p>
      ) : error ? (
        <p className="font-pixel text-xs text-rose-400">{error}</p>
      ) : resolvedSessions.length === 0 ? (
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
