import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormTextarea } from './FormTextarea'

const meta: Meta<typeof FormTextarea> = {
  title: 'Forms/FormTextarea',
  component: FormTextarea,
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

function Controlled(args: React.ComponentProps<typeof FormTextarea>) {
  const [value, setValue] = useState(args.value ?? '')
  return <FormTextarea {...args} value={value} onChange={(e) => setValue(e.target.value)} />
}

export const Default: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    placeholder: 'Enter text...',
  },
}

export const WithCharacterCount: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Description',
    placeholder: 'Describe your campaign...',
    maxLength: 500,
    rows: 4,
  },
}

export const WithError: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Description',
    placeholder: 'Describe your campaign...',
    error: 'Description is too long.',
  },
}

export const Disabled: Story = {
  render: (args) => <Controlled {...args} />,
  args: {
    label: 'Description',
    value: 'Frozen campaign notes.',
    disabled: true,
  },
}
