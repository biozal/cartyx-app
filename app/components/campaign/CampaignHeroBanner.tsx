import React from 'react'

interface CampaignHeroBannerProps {
  name: string
  imagePath: string | null
  status: string
}

function isValidImagePath(path: string): boolean {
  return (
    /^\/uploads\/[a-zA-Z0-9/_.-]+$/.test(path) ||
    /^https:\/\/[^/]+\/uploads\/[\w/._-]+$/.test(path)
  )
}

export function CampaignHeroBanner({ name, imagePath, status }: CampaignHeroBannerProps) {
  const isActive = status === 'active'
  const hasImage = !!imagePath && isValidImagePath(imagePath)

  return (
    <div className="relative h-56 overflow-hidden">
      {hasImage ? (
        <img
          src={imagePath!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: isActive
              ? 'linear-gradient(135deg, #0F1729 0%, #0D1B3E 50%, #0A1628 100%)'
              : 'linear-gradient(135deg, #0F1117 0%, #141820 50%, #0C0E14 100%)',
          }}
        />
      )}

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Status badge top-left */}
      <span
        className="absolute top-4 left-4 font-sans font-semibold text-[9px] tracking-wide px-2.5 py-1 rounded-md"
        style={{ background: isActive ? '#2563EB' : '#334155', color: isActive ? '#fff' : '#CBD5E1' }}
      >
        {isActive ? 'ACTIVE' : 'PAUSED'}
      </span>

      {/* Campaign name overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h2 className="font-sans font-semibold text-[13px] text-white leading-relaxed tracking-wide drop-shadow-lg">
          {name}
        </h2>
      </div>
    </div>
  )
}
