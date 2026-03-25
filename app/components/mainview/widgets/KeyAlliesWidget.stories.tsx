import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardView } from '~/components/mainview/DashboardView'
import { KeyAlliesWidget } from '~/components/mainview/widgets/KeyAlliesWidget'

const meta: Meta<typeof KeyAlliesWidget> = {
  title: 'Components/MainView/Widgets/KeyAlliesWidget',
  component: KeyAlliesWidget,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#080A12] p-6">
        <div className="max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}

export const Empty: Story = {
  args: {
    allies: [],
  },
}

export const InDashboardGrid: Story = {
  render: () => (
    <div className="min-h-screen bg-[#080A12]">
      <DashboardView>
        <KeyAlliesWidget />
      </DashboardView>
    </div>
  ),
}
