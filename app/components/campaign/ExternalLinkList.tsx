import React from 'react'
import { ExternalLinkItem } from './ExternalLinkItem'

interface ExternalLinkListProps {
  links: Array<{ name: string; url: string }>
}

export function ExternalLinkList({ links }: ExternalLinkListProps) {
  const renderableLinks = links.filter(
    (link) => typeof link.url === 'string' && link.url.trim() !== ''
  )

  if (!renderableLinks.length) return null

  return (
    <div>
      <div className="text-[10px] font-pixel text-slate-500 tracking-wide mb-2">LINKS</div>
      <div className="flex flex-col gap-1">
        {renderableLinks.map((link, i) => (
          <ExternalLinkItem key={`${link.name}:${link.url}`} name={link.name} url={link.url} />
        ))}
      </div>
    </div>
  )
}
