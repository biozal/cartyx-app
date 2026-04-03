import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBookOpen } from '@fortawesome/pro-solid-svg-icons'
import { useParams } from '@tanstack/react-router'
import { Widget } from '~/components/mainview/Widget'
import { useCampaign } from '~/hooks/useCampaigns'
import type { CampaignData } from '~/types/campaign'

type Session = CampaignData['sessions'][number]
export type { Session }

export interface SessionsListWidgetProps {
  sessions?: ReadonlyArray<Readonly<Session>>
  className?: string
}

export function SessionsListWidget({ sessions: sessionsProp, className = '' }: SessionsListWidgetProps) {
  const { campaignId } = useParams({ from: '/campaigns/$campaignId/play' })
  const { campaign, isLoading, error: fetchError } = useCampaign(campaignId)

  const sessions = sessionsProp ?? campaign?.sessions ?? []
  const error = fetchError && !sessionsProp ? fetchError : null

  return (
    <Widget title="Sessions" className={className}>
      {isLoading && !sessionsProp ? (
        <p className="font-sans font-semibold text-xs text-on-surface-variant">Loading sessions...</p>
      ) : error ? (
        <p className="font-sans font-semibold text-xs text-rose-400">Unable to load sessions.</p>
      ) : sessions.length === 0 ? (
        <p className="font-sans font-semibold text-xs text-on-surface-variant">No sessions recorded</p>
      ) : (
        <div data-testid="sessions-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sessions.slice(0, 5).map((session) => (
            <article
              key={session.id}
              className="p-4 bg-surface-container-highest/20 hover:bg-primary/5 rounded border border-outline-variant/20 group transition-all"
            >
              <FontAwesomeIcon
                icon={faBookOpen}
                className="text-primary mb-3 block text-xl group-hover:scale-110 transition-transform"
              />
              <p className="font-sans font-semibold text-xs text-on-surface-variant">Session {session.number}</p>
              <h3 className="font-sans text-sm font-bold text-primary truncate mt-1">{session.name}</h3>
              <p className="text-[0.6rem] text-on-surface-variant/60 uppercase font-sans mt-1">{session.startDate}</p>
            </article>
          ))}
        </div>
      )}
    </Widget>
  )
}
