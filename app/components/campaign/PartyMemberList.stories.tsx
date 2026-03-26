import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PartyMemberList } from './PartyMemberList'

const meta: Meta<typeof PartyMemberList> = {
  title: 'Campaign/PartyMemberList',
  component: PartyMemberList,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4 bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

const threeMembers = [
  { id: '1', characterName: 'Thalion Swiftarrow', characterClass: 'Ranger', avatar: null, userId: 'u1' },
  { id: '2', characterName: 'Baldric Ironforge', characterClass: 'Fighter', avatar: null, userId: 'u2' },
  { id: '3', characterName: 'Lyra Moonwhisper', characterClass: 'Wizard', avatar: null, userId: 'u3' },
]

export const Default: Story = {
  args: { members: threeMembers, maxPlayers: 4 },
}

export const FullParty: Story = {
  args: { members: threeMembers.map((m, i) => ({ ...m, id: String(i) })), maxPlayers: 3 },
}

export const EmptyWithSlots: Story = {
  args: { members: [], maxPlayers: 4 },
}

export const MaxPlayers: Story = {
  args: {
    members: Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      characterName: `Hero ${i + 1}`,
      characterClass: 'Fighter',
      avatar: null,
      userId: `u${i}`,
    })),
    maxPlayers: 10,
  },
}

export const NoSlots: Story = {
  args: { members: [], maxPlayers: 0 },
}
