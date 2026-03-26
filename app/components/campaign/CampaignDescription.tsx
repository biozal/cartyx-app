import React from 'react'

interface CampaignDescriptionProps {
  description: string
}

export function CampaignDescription({ description }: CampaignDescriptionProps) {
  if (!description) return null

  return (
    <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">
      {description}
    </p>
  )
}
