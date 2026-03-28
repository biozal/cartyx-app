import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBookOpen } from '@fortawesome/pro-solid-svg-icons'
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
        <div data-testid="sessions-grid" className="grid grid-cols-5 gap-4">
          {resolvedSessions.slice(0, 5).map((session) => (
            <article
              key={session.id}
              className="p-4 bg-surface-container-highest/20 hover:bg-primary/5 rounded border border-outline-variant/20 group cursor-pointer transition-all"
            >
              <FontAwesomeIcon
                icon={faBookOpen}
                className="text-primary mb-3 block text-xl group-hover:scale-110 transition-transform"
              />
              <p className="font-pixel text-xs text-on-surface-variant">Session {session.number}</p>
              <h3 className="font-pixel text-sm font-bold text-primary truncate mt-1">{session.name}</h3>
              <p className="text-[0.6rem] text-on-surface-variant/60 uppercase font-label mt-1">{session.date}</p>
            </article>
          ))}
        </div>
      )}
    </Widget>
  )
}
