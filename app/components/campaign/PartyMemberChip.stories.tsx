import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PartyMemberChip } from './PartyMemberChip'

const meta: Meta<typeof PartyMemberChip> = {
  title: 'Campaign/PartyMemberChip',
  component: PartyMemberChip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4 bg-[#0D1117] inline-flex">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    characterName: 'Thalion Swiftarrow',
    characterClass: 'Ranger',
    avatar: null,
  },
}

export const WithAvatar: Story = {
  args: {
    characterName: 'Lyra Moonwhisper',
    characterClass: 'Wizard',
    avatar: 'https://i.pravatar.cc/40?img=47',
  },
}

export const LongName: Story = {
  args: {
    characterName: 'Bartholomew Thunderstrike the Mighty',
    characterClass: 'Paladin of the Radiant Dawn',
    avatar: null,
  },
}
