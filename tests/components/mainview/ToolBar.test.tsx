import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolBar } from '~/components/mainview/ToolBar'
import type { ToolType } from '~/components/mainview/ToolBar'

const allTools: ToolType[] = ['pointer', 'hand', 'drawing', 'text', 'ruler', 'dice', 'stamp', 'layer']

function renderToolBar(props: Partial<React.ComponentProps<typeof ToolBar>> = {}) {
  const defaults = {
    activeTool: 'pointer' as ToolType,
    onToolChange: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
  }
  return render(<ToolBar {...defaults} {...props} />)
}

describe('ToolBar', () => {
  it('renders all 8 tool buttons when expanded', () => {
    renderToolBar()
    for (const tool of allTools) {
      expect(screen.getByTestId(`tool-${tool}`)).toBeInTheDocument()
    }
  })

  it('active tool has aria-pressed=true', () => {
    renderToolBar({ activeTool: 'hand' })
    expect(screen.getByTestId('tool-hand')).toHaveAttribute('aria-pressed', 'true')
  })

  it('inactive tools have aria-pressed=false', () => {
    renderToolBar({ activeTool: 'pointer' })
    expect(screen.getByTestId('tool-hand')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('tool-drawing')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onToolChange with correct tool when clicked', async () => {
    const user = userEvent.setup()
    const onToolChange = vi.fn()
    renderToolBar({ onToolChange })
    await user.click(screen.getByTestId('tool-ruler'))
    expect(onToolChange).toHaveBeenCalledWith('ruler')
  })

  it('calls onToolChange for each tool when clicked', async () => {
    const user = userEvent.setup()
    const onToolChange = vi.fn()
    renderToolBar({ onToolChange })
    for (const tool of allTools) {
      await user.click(screen.getByTestId(`tool-${tool}`))
      expect(onToolChange).toHaveBeenCalledWith(tool)
    }
  })

  it('renders collapse toggle button', () => {
    renderToolBar()
    expect(screen.getByTestId('toolbar-toggle')).toBeInTheDocument()
  })

  it('collapse toggle has correct aria-label when expanded', () => {
    renderToolBar({ collapsed: false })
    expect(screen.getByTestId('toolbar-toggle')).toHaveAttribute('aria-label', 'Collapse toolbar')
  })

  it('collapse toggle has correct aria-label when collapsed', () => {
    renderToolBar({ collapsed: true })
    expect(screen.getByTestId('toolbar-toggle')).toHaveAttribute('aria-label', 'Expand toolbar')
  })

  it('calls onToggleCollapse when toggle is clicked', async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()
    renderToolBar({ onToggleCollapse })
    await user.click(screen.getByTestId('toolbar-toggle'))
    expect(onToggleCollapse).toHaveBeenCalledOnce()
  })

  it('hides tool buttons when collapsed', () => {
    renderToolBar({ collapsed: true })
    for (const tool of allTools) {
      expect(screen.queryByTestId(`tool-${tool}`)).not.toBeInTheDocument()
    }
  })

  it('all tool buttons have type=button', () => {
    renderToolBar()
    for (const tool of allTools) {
      expect(screen.getByTestId(`tool-${tool}`)).toHaveAttribute('type', 'button')
    }
  })

  it('collapse toggle has type=button', () => {
    renderToolBar()
    expect(screen.getByTestId('toolbar-toggle')).toHaveAttribute('type', 'button')
  })
})
