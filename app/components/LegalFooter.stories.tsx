import type { Meta, StoryObj } from '@storybook/react-vite'
import { LegalFooter } from './LegalFooter'

// @tanstack/react-router is aliased to a mock in .storybook/main.ts viteFinal

const meta: Meta<typeof LegalFooter> = {
  title: 'Components/LegalFooter',
  component: LegalFooter,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
