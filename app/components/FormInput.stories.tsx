import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormInput } from './FormInput'

const meta: Meta<typeof FormInput> = {
  title: 'Forms/FormInput',
  component: FormInput,
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

function Controlled(args: React.ComponentProps<typeof FormInput>) {
  const [value, setValue] = useState(args.value ?? '')
  return <FormInput {...args} value={value} onChange={(e) => setValue(e.target.value)} />
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    placeholder: 'Enter text...',
  },
}

export const WithLabel: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Campaign Name',
    placeholder: 'Enter campaign name...',
    hint: '0/60',
  },
}

export const WithError: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Campaign Name',
    placeholder: 'Enter campaign name...',
    error: 'Campaign name is required.',
  },
}

export const Disabled: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Campaign Name',
    value: 'The Lost Mines',
    placeholder: 'Enter campaign name...',
    disabled: true,
  },
}

export const URLType: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Discord Link',
    type: 'url',
    placeholder: 'https://discord.gg/...',
  },
}
