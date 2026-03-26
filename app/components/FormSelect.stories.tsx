import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormSelect } from './FormSelect'

const timezoneOptions = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
]

const meta: Meta<typeof FormSelect> = {
  title: 'Forms/FormSelect',
  component: FormSelect,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-md p-6 bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

function Controlled(args: React.ComponentProps<typeof FormSelect>) {
  const [value, setValue] = useState(args.value ?? '')
  return <FormSelect {...args} value={value} onChange={(e) => setValue(e.target.value)} />
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    options: timezoneOptions,
    value: 'America/Chicago',
  },
}

export const WithLabel: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Timezone',
    options: timezoneOptions,
    value: 'America/Chicago',
  },
}

export const Disabled: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Timezone',
    options: timezoneOptions,
    value: 'America/Chicago',
    disabled: true,
  },
}
