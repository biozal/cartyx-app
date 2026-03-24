import React from 'react'

interface ExternalLinkItemProps {
  name: string
  url: string
}

export function ExternalLinkItem({ name, url }: ExternalLinkItemProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors py-0.5"
    >
      <span className="text-base leading-none">🔗</span>
      <span>{name}</span>
    </a>
  )
}
