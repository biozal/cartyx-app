import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToolBar } from './ToolBar'
import type { ToolType } from './ToolBar'

const meta: Meta<typeof ToolBar> = {
  title: 'Components/ToolBar',
  component: ToolBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => {
      const isCollapsed = context.args?.collapsed ?? false
      return (
        <div className="h-screen bg-[#080A12] flex">
          <div className={`${isCollapsed ? 'w-8' : 'w-14'} h-full border-r border-white/[0.07]`}>
            <Story />
          </div>
        </div>
      )
    },
  ],
}
export default meta
type Story = StoryObj<typeof meta>

function ControlledToolBar(props: Partial<React.ComponentProps<typeof ToolBar>>) {
  const [activeTool, setActiveTool] = useState<ToolType>(props.activeTool ?? 'pointer')
  const [collapsed, setCollapsed] = useState(props.collapsed ?? false)
  return (
    <ToolBar
      activeTool={activeTool}
      onToolChange={setActiveTool}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed(c => !c)}
    />
  )
}

export const Expanded: Story = {
  render: () => <ControlledToolBar />,
}

export const Collapsed: Story = {
  render: () => <ControlledToolBar collapsed />,
}

export const HandActive: Story = {
  render: () => <ControlledToolBar activeTool="hand" />,
}
