import React from 'react'
import { ExternalLinkItem } from './ExternalLinkItem'

interface ExternalLinkListProps {
  links: Array<{ name: string; url: string }>
}

export function ExternalLinkList({ links }: ExternalLinkListProps) {
  if (!links.length) return null

  return (
    <div>
      <div className="text-[10px] font-pixel text-slate-500 tracking-wide mb-2">LINKS</div>
      <div className="flex flex-col gap-1">
        {links.map((link, i) => (
          <ExternalLinkItem key={i} name={link.name} url={link.url} />
        ))}
      </div>
    </div>
  )
}
