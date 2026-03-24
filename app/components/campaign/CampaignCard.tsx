import React from 'react'
import { CampaignHeroBanner } from './CampaignHeroBanner'
import { CampaignDescription } from './CampaignDescription'
import { NextSessionBadge } from './NextSessionBadge'
import { PartyMemberList } from './PartyMemberList'
import { InviteCodeField } from './InviteCodeField'
import { ExternalLinkList } from './ExternalLinkList'
import { PixelButton } from '~/components/PixelButton'

// Mirrors CampaignData from ~/server/functions/campaigns — kept local to avoid
// bundling server modules (mongoose, @tanstack/react-start) in browser builds.
export interface CampaignCardData {
  id: string
  name: string
  description: string
  status: string
  inviteCode: string
  imagePath: string | null
  links: Array<{ name: string; url: string }>
  maxPlayers: number
  schedule: {
    frequency: string | null
    dayOfWeek: string | null
    time: string | null
    timezone: string | null
  }
  players: { current: number; max: number }
  partyMembers: Array<{
    id: string
    characterName: string
    characterClass: string
    avatar: string | null
    userId: string
  }>
  nextSession: { day: string; time: string } | null
  isOwner: boolean
  isMember: boolean
  scheduleText: string
}

interface CampaignCardProps {
  campaign: CampaignCardData
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <div className="group bg-[#0D1117] border-l-4 border-l-blue-600 border border-white/[0.07] rounded-2xl overflow-hidden hover:border-blue-500/25 hover:shadow-2xl transition-all duration-200">
      <CampaignHeroBanner
        name={campaign.name}
        imagePath={campaign.imagePath}
        status={campaign.status}
      />

      <div className="p-6 flex flex-col md:flex-row gap-6">
        {/* Left column: description, next session, party */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          <CampaignDescription description={campaign.description} />
          <NextSessionBadge
            nextSession={campaign.nextSession}
            schedule={campaign.schedule}
          />
          <PartyMemberList
            members={campaign.partyMembers}
            maxPlayers={campaign.maxPlayers}
          />
        </div>

        {/* Right column: invite code, links, actions */}
        <div className="flex flex-col gap-4 md:w-64 flex-shrink-0">
          {campaign.isOwner && campaign.inviteCode && (
            <InviteCodeField code={campaign.inviteCode} />
          )}
          <ExternalLinkList links={campaign.links} />
          <div className="flex flex-col gap-2 mt-auto pt-2">
            <PixelButton
              as="link"
              variant="primary"
              size="md"
              to="/campaigns/$campaignId/summary"
              params={{ campaignId: campaign.id }}
              fullWidth
            >
              Enter Campaign
            </PixelButton>
            {campaign.isOwner && (
              <PixelButton
                as="link"
                variant="warning"
                size="md"
                icon="✏️"
                to="/campaigns/$campaignId/edit"
                params={{ campaignId: campaign.id }}
                fullWidth
              >
                Edit Campaign
              </PixelButton>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
