import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CampaignHeroBanner } from './CampaignHeroBanner'

const meta: Meta<typeof CampaignHeroBanner> = {
  title: 'Campaign/CampaignHeroBanner',
  component: CampaignHeroBanner,
  tags: ['autodocs'],
  argTypes: {
    status: { control: 'select', options: ['active', 'paused'] },
    imagePath: { control: 'text' },
    name: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div className="group max-w-3xl">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    name: 'The Lost Mines of Phandelver',
    imagePath: null,
    status: 'active',
  },
}

export const Paused: Story = {
  args: {
    name: 'Curse of Strahd',
    imagePath: null,
    status: 'paused',
  },
}

export const LongName: Story = {
  args: {
    name: 'The Tomb of Annihilation — A Chult Expedition',
    imagePath: null,
    status: 'active',
  },
}
