import { useEffect, useState } from 'react'
import { Widget } from '~/components/mainview/Widget'
import { getKeyAllies, type KeyAlly } from '~/services/mocks/keyAlliesService'

export interface KeyAlliesWidgetProps {
  allies?: ReadonlyArray<Readonly<KeyAlly>>
  className?: string
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function KeyAlliesWidget({
  allies,
  className = '',
}: KeyAlliesWidgetProps) {
  const [resolvedAllies, setResolvedAllies] = useState<KeyAlly[] | null>(
    allies ? allies.map((ally) => ({ ...ally })) : null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (allies) {
      setResolvedAllies(allies.map((ally) => ({ ...ally })))
      setError(null)
      return
    }

    let isMounted = true
    setError(null)

    void getKeyAllies()
      .then((nextAllies) => {
        if (isMounted) {
          setResolvedAllies(nextAllies)
        }
      })
      .catch((error) => {
        console.error(error)
        if (isMounted) {
          setError('Unable to load allies.')
          setResolvedAllies([])
        }
      })

    return () => {
      isMounted = false
    }
  }, [allies])

  return (
    <Widget title="Key Allies" className={className}>
      {resolvedAllies === null ? (
        <p className="font-pixel text-xs text-slate-500">Loading allies...</p>
      ) : error ? (
        <p className="font-pixel text-xs text-rose-400">{error}</p>
      ) : resolvedAllies.length === 0 ? (
        <p className="font-pixel text-xs text-slate-500">No allies found</p>
      ) : (
        <div className="space-y-3">
          {resolvedAllies.map((ally) => (
            <div
              key={ally.id}
              className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.07] bg-slate-800 font-pixel text-xs text-white">
                {ally.avatarUrl ? (
                  <img
                    src={ally.avatarUrl}
                    alt={ally.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true">{getInitials(ally.name)}</span>
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate font-pixel text-xs text-white">{ally.name}</p>
                <p className="truncate font-pixel text-xs text-slate-400">{ally.town}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}
