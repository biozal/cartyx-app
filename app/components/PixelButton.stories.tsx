import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PixelButton } from './PixelButton'

// PixelButton has a discriminated union prop type (button | anchor | router-link).
// We use a simplified button-variant type here to keep story args typesafe.
type ButtonStoryProps = {
  variant?: 'primary' | 'secondary' | 'warning' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  fullWidth?: boolean
  disabled?: boolean
  children?: React.ReactNode
}

const meta: Meta<ButtonStoryProps> = {
  title: 'Components/PixelButton',
  component: PixelButton as React.ComponentType<ButtonStoryProps>,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'warning', 'ghost', 'danger'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    icon: { control: 'text' },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
    children: { control: 'text' },
  },
  args: {
    children: 'Click Me',
    variant: 'primary',
    size: 'md',
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary', children: 'Primary' } }
export const Secondary: Story = { args: { variant: 'secondary', children: 'Secondary' } }
export const Warning: Story = { args: { variant: 'warning', children: 'Warning' } }
export const Ghost: Story = { args: { variant: 'ghost', children: 'Ghost' } }
export const Danger: Story = { args: { variant: 'danger', children: 'Danger' } }

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <PixelButton variant="primary">Primary</PixelButton>
      <PixelButton variant="secondary">Secondary</PixelButton>
      <PixelButton variant="warning">Warning</PixelButton>
      <PixelButton variant="ghost">Ghost</PixelButton>
      <PixelButton variant="danger">Danger</PixelButton>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <PixelButton size="sm">Small</PixelButton>
      <PixelButton size="md">Medium</PixelButton>
      <PixelButton size="lg">Large</PixelButton>
    </div>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <PixelButton icon="⚔">Attack</PixelButton>
      <PixelButton variant="warning" icon="🛡">Defend</PixelButton>
      <PixelButton variant="danger" icon="💀">Flee</PixelButton>
      <PixelButton variant="secondary" icon="📜">Inventory</PixelButton>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <PixelButton disabled>Primary Disabled</PixelButton>
      <PixelButton variant="secondary" disabled>Secondary Disabled</PixelButton>
      <PixelButton variant="danger" disabled>Danger Disabled</PixelButton>
    </div>
  ),
}

export const FullWidth: Story = {
  args: { fullWidth: true, children: 'Full Width Button' },
}

export const AsAnchor: Story = {
  render: () => (
    <PixelButton as="a" href="https://example.com" target="_blank" rel="noopener noreferrer">
      External Link
    </PixelButton>
  ),
}
