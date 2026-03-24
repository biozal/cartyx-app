import type { Meta, StoryObj } from '@storybook/react-vite'
import { MainView } from './MainView'

const DashboardContent = () => (
  <div className="h-full flex items-center justify-center">
    <div className="px-6 py-4 rounded-xl border border-white/[0.07] bg-white/[0.02] text-sm text-slate-500 font-pixel tracking-wider">
      Dashboard Content
    </div>
  </div>
)

const meta: Meta<typeof MainView> = {
  title: 'Components/MainView',
  component: MainView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <MainView>
      <DashboardContent />
    </MainView>
  ),
}

export const WithToolbar: Story = {
  render: () => (
    <MainView showToolbar showInspector={false}>
      <DashboardContent />
    </MainView>
  ),
}

export const BothSidebars: Story = {
  render: () => (
    <MainView showToolbar showInspector>
      <DashboardContent />
    </MainView>
  ),
}

export const ContentOnly: Story = {
  render: () => (
    <MainView showToolbar={false} showInspector={false}>
      <DashboardContent />
    </MainView>
  ),
}
