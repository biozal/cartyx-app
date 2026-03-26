import type { Meta, StoryObj } from '@storybook/react-vite'
import { InspectorSidebar } from './InspectorSidebar'

const meta: Meta<typeof InspectorSidebar> = {
  title: 'Components/InspectorSidebar',
  component: InspectorSidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#080A12] flex justify-end">
        <div className="w-80 h-full border-l border-white/[0.07]">
          <Story />
        </div>
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    defaultTab: 'chat',
  },
}

export const WikiTab: Story = {
  args: {
    defaultTab: 'wiki',
  },
}

export const NotepadTab: Story = {
  args: {
    defaultTab: 'notepad',
  },
}

export const SettingsTab: Story = {
  args: {
    defaultTab: 'settings',
  },
}
