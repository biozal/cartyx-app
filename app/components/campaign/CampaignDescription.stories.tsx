import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CampaignDescription } from './CampaignDescription'

const meta: Meta<typeof CampaignDescription> = {
  title: 'Campaign/CampaignDescription',
  component: CampaignDescription,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-xl p-4 bg-[#0D1117]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    description:
      'Four heroes set out on a dangerous quest through the Forgotten Realms. Ancient evils stir in the ruins of Phandalin as the party races to uncover the secrets of the lost mine before the Spider claims it for himself.',
  },
}

export const Empty: Story = {
  args: { description: '' },
}

export const Short: Story = {
  args: { description: 'A classic dungeon crawl.' },
}

export const VeryLong: Story = {
  args: {
    description:
      'This is an extraordinarily long campaign description that goes on and on and on and on. ' +
      'It describes the lore, the world, the characters, and the plot in excruciating detail. ' +
      'The party consists of a ragtag group of adventurers who have been brought together by fate, ' +
      'or perhaps by something more sinister. The world is dark, the stakes are high, ' +
      'and the dungeon master has clearly spent too much time writing this. ' +
      'This text should be clamped to three lines maximum.',
  },
}
