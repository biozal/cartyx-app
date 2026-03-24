import type { Meta, StoryObj } from '@storybook/react-vite'
import { MainView } from './MainView'

const DashboardContent = () => (
  <div className="h-full flex items-center justify-center">
    <div className="px-6 py-4 rounded-xl border border-white/[0.07] bg-white/[0.02] text-sm text-slate-500 font-pixel tracking-wider">
      Dashboard Content
    </div>
  </div>
)

const ToolbarPlaceholder = () => (
  <div className="h-full flex flex-col items-center justify-center border-r border-white/[0.07]">
    <span className="text-[9px] text-slate-600 font-pixel tracking-wider [writing-mode:vertical-rl]">TOOLBAR</span>
  </div>
)

const InspectorPlaceholder = () => (
  <div className="h-full flex flex-col gap-3 p-4 border-l border-white/[0.07]">
    <span className="text-[9px] text-slate-600 font-pixel tracking-wider uppercase">Inspector</span>
  </div>
)

const meta: Meta<typeof MainView> = {
  title: 'Components/MainView',
  component: MainView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    showToolbar: false,
    showInspector: true,
    children: (
      <>
        <DashboardContent />
        <InspectorPlaceholder />
      </>
    ),
  },
  render: (args) => (
    <MainView {...args}>
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

// Suppress unused import warnings for placeholder components used in docs
void ToolbarPlaceholder
void InspectorPlaceholder
