import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenBar } from '~/components/mainview/gmscreens/ScreenBar'
import type { GMScreenData } from '~/types/gmscreen'

const screens: GMScreenData[] = [
  { id: 's1', campaignId: 'c1', name: 'Alpha', tabOrder: 0, createdBy: 'u1', createdAt: '', updatedAt: '' },
  { id: 's2', campaignId: 'c1', name: 'Bravo', tabOrder: 1, createdBy: 'u1', createdAt: '', updatedAt: '' },
  { id: 's3', campaignId: 'c1', name: 'Charlie', tabOrder: 2, createdBy: 'u1', createdAt: '', updatedAt: '' },
]

const defaultProps = {
  screens,
  activeScreenId: 's1',
  onSelectScreen: vi.fn(),
  onCreateScreen: vi.fn(),
  onRenameScreen: vi.fn(),
  onDeleteScreen: vi.fn(),
  onReorderScreens: vi.fn(),
}

describe('ScreenBar — tab keyboard navigation', () => {
  it('ArrowRight moves focus and selects the next tab', async () => {
    const user = userEvent.setup()
    const onSelectScreen = vi.fn()
    render(<ScreenBar {...defaultProps} onSelectScreen={onSelectScreen} />)

    const activeTab = screen.getByTestId('screen-tab-s1')
    activeTab.focus()
    await user.keyboard('{ArrowRight}')

    expect(onSelectScreen).toHaveBeenCalledWith('s2')
  })

  it('ArrowLeft wraps from first tab to last', async () => {
    const user = userEvent.setup()
    const onSelectScreen = vi.fn()
    render(<ScreenBar {...defaultProps} onSelectScreen={onSelectScreen} />)

    const activeTab = screen.getByTestId('screen-tab-s1')
    activeTab.focus()
    await user.keyboard('{ArrowLeft}')

    expect(onSelectScreen).toHaveBeenCalledWith('s3')
  })

  it('Home focuses the first tab', async () => {
    const user = userEvent.setup()
    const onSelectScreen = vi.fn()
    render(<ScreenBar {...defaultProps} activeScreenId="s3" onSelectScreen={onSelectScreen} />)

    const lastTab = screen.getByTestId('screen-tab-s3')
    lastTab.focus()
    await user.keyboard('{Home}')

    expect(onSelectScreen).toHaveBeenCalledWith('s1')
  })

  it('End focuses the last tab', async () => {
    const user = userEvent.setup()
    const onSelectScreen = vi.fn()
    render(<ScreenBar {...defaultProps} onSelectScreen={onSelectScreen} />)

    const firstTab = screen.getByTestId('screen-tab-s1')
    firstTab.focus()
    await user.keyboard('{End}')

    expect(onSelectScreen).toHaveBeenCalledWith('s3')
  })

  it('only active tab has tabIndex=0', () => {
    render(<ScreenBar {...defaultProps} activeScreenId="s2" />)

    expect(screen.getByTestId('screen-tab-s1')).toHaveAttribute('tabIndex', '-1')
    expect(screen.getByTestId('screen-tab-s2')).toHaveAttribute('tabIndex', '0')
    expect(screen.getByTestId('screen-tab-s3')).toHaveAttribute('tabIndex', '-1')
  })
})

describe('ScreenBar — settings dropdown', () => {
  it('opens menu on settings button click', async () => {
    const user = userEvent.setup()
    render(<ScreenBar {...defaultProps} />)

    await user.click(screen.getByTestId('screen-settings-trigger'))

    expect(screen.getByTestId('screen-settings-menu')).toBeInTheDocument()
  })

  it('closes menu on Escape and returns focus to trigger', async () => {
    const user = userEvent.setup()
    render(<ScreenBar {...defaultProps} />)

    await user.click(screen.getByTestId('screen-settings-trigger'))
    expect(screen.getByTestId('screen-settings-menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('screen-settings-menu')).not.toBeInTheDocument()
    expect(screen.getByTestId('screen-settings-trigger')).toHaveFocus()
  })

  it('arrow keys navigate between menu items', async () => {
    const user = userEvent.setup()
    render(<ScreenBar {...defaultProps} />)

    await user.click(screen.getByTestId('screen-settings-trigger'))

    const menu = screen.getByTestId('screen-settings-menu')
    const items = within(menu).getAllByRole('menuitem')

    // First non-disabled item is focused on open
    expect(items[0]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(items[0]).toHaveFocus()
  })

  it('disables delete when only one screen exists', async () => {
    const user = userEvent.setup()
    render(<ScreenBar {...defaultProps} screens={[screens[0]]} />)

    await user.click(screen.getByTestId('screen-settings-trigger'))

    const menu = screen.getByTestId('screen-settings-menu')
    const deleteBtn = within(menu).getByRole('menuitem', { name: /Delete Screen/i })
    expect(deleteBtn).toBeDisabled()
  })

  it('clicking New Screen calls onCreateScreen and closes menu', async () => {
    const user = userEvent.setup()
    const onCreateScreen = vi.fn()
    render(<ScreenBar {...defaultProps} onCreateScreen={onCreateScreen} />)

    await user.click(screen.getByTestId('screen-settings-trigger'))
    await user.click(within(screen.getByTestId('screen-settings-menu')).getByRole('menuitem', { name: /New Screen/i }))

    expect(onCreateScreen).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('screen-settings-menu')).not.toBeInTheDocument()
  })
})

describe('ScreenBar — ARIA attributes', () => {
  it('tablist has proper role and label', () => {
    render(<ScreenBar {...defaultProps} />)
    const tablist = screen.getByRole('tablist', { name: 'GM Screens' })
    expect(tablist).toBeInTheDocument()
  })

  it('tabs have correct aria-selected and aria-controls', () => {
    render(<ScreenBar {...defaultProps} activeScreenId="s2" />)

    const tab = screen.getByTestId('screen-tab-s2')
    expect(tab).toHaveAttribute('role', 'tab')
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveAttribute('aria-controls', 'gmscreen-tabpanel-s2')
  })

  it('each tab has a unique aria-controls matching its screen', () => {
    render(<ScreenBar {...defaultProps} />)

    expect(screen.getByTestId('screen-tab-s1')).toHaveAttribute('aria-controls', 'gmscreen-tabpanel-s1')
    expect(screen.getByTestId('screen-tab-s2')).toHaveAttribute('aria-controls', 'gmscreen-tabpanel-s2')
    expect(screen.getByTestId('screen-tab-s3')).toHaveAttribute('aria-controls', 'gmscreen-tabpanel-s3')
  })

  it('settings trigger has correct aria-expanded', async () => {
    const user = userEvent.setup()
    render(<ScreenBar {...defaultProps} />)

    const trigger = screen.getByTestId('screen-settings-trigger')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
