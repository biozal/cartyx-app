import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InviteCodeField } from './InviteCodeField'
import { Toast } from '~/components/Toast'

const meta: Meta<typeof InviteCodeField> = {
  title: 'Campaign/InviteCodeField',
  component: InviteCodeField,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4 bg-[#0D1117]">
        <Story />
        <Toast />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { code: 'ABCD-EFGH' },
}

export const LongCode: Story = {
  args: { code: 'XYZW-ABCD-1234' },
}
