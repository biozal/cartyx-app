import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabNavigation, TABS } from '~/components/mainview/TabNavigation'
import type { TabId } from '~/components/mainview/TabNavigation'

describe('TabNavigation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders Dashboard, Tabletop, and GM Screens tabs by default', () => {
    render(<TabNavigation activeTab="dashboard" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'GM Screens' })).toBeInTheDocument()
  })

  it('marks dashboard tab as active when activeTab is dashboard', () => {
    render(<TabNavigation activeTab="dashboard" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'false')
  })

  it('marks tabletop tab as active when activeTab is tabletop', () => {
    render(<TabNavigation activeTab="tabletop" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'false')
  })

  it('only active tab is tabbable (roving tabindex)', () => {
    render(<TabNavigation activeTab="dashboard" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('tabindex', '-1')
  })

  it('calls onTabChange with "tabletop" when Tabletop tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="dashboard" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Tabletop' }))
    expect(onTabChange).toHaveBeenCalledWith('tabletop')
  })

  it('calls onTabChange with "dashboard" when Dashboard tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="tabletop" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }))
    expect(onTabChange).toHaveBeenCalledWith('dashboard')
  })

  it('arrow keys navigate between tabs', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="dashboard" onTabChange={onTabChange} />)
    const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' })
    fireEvent.keyDown(dashboardTab, { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('tabletop')
  })

  it('wraps around from last tab to first on ArrowRight', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="gmscreens" onTabChange={onTabChange} />)
    const gmScreensTab = screen.getByRole('tab', { name: 'GM Screens' })
    fireEvent.keyDown(gmScreensTab, { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('dashboard')
  })

  it('Home key navigates to first tab', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="tabletop" onTabChange={onTabChange} />)
    const tabletopTab = screen.getByRole('tab', { name: 'Tabletop' })
    fireEvent.keyDown(tabletopTab, { key: 'Home' })
    expect(onTabChange).toHaveBeenCalledWith('dashboard')
  })

  it('End key navigates to last tab', () => {
    const onTabChange = vi.fn()
    render(<TabNavigation activeTab="dashboard" onTabChange={onTabChange} />)
    const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' })
    fireEvent.keyDown(dashboardTab, { key: 'End' })
    expect(onTabChange).toHaveBeenCalledWith('gmscreens')
  })

  it('tabs have aria-controls pointing to their panels', () => {
    render(<TabNavigation activeTab="dashboard" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-controls', 'tab-panel-dashboard')
    expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('aria-controls', 'tab-panel-tabletop')
    expect(screen.getByRole('tab', { name: 'GM Screens' })).toHaveAttribute('aria-controls', 'tab-panel-gmscreens')
  })

  // --- GM-only tab visibility ---

  describe('with visibleTabs filtering', () => {
    const nonOwnerTabs = TABS.filter(t => !t.gmOnly)

    it('only renders visible tabs when visibleTabs is provided', () => {
      render(
        <TabNavigation activeTab="dashboard" onTabChange={() => {}} visibleTabs={nonOwnerTabs} />,
      )
      expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tabletop' })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'GM Screens' })).not.toBeInTheDocument()
    })

    it('roving tabindex works with filtered tabs', () => {
      render(
        <TabNavigation activeTab="dashboard" onTabChange={() => {}} visibleTabs={nonOwnerTabs} />,
      )
      expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('tab', { name: 'Tabletop' })).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight wraps from last visible tab to first', () => {
      const onTabChange = vi.fn()
      render(
        <TabNavigation activeTab="tabletop" onTabChange={onTabChange} visibleTabs={nonOwnerTabs} />,
      )
      const tabletopTab = screen.getByRole('tab', { name: 'Tabletop' })
      fireEvent.keyDown(tabletopTab, { key: 'ArrowRight' })
      expect(onTabChange).toHaveBeenCalledWith('dashboard')
    })

    it('End key navigates to last visible tab', () => {
      const onTabChange = vi.fn()
      render(
        <TabNavigation activeTab="dashboard" onTabChange={onTabChange} visibleTabs={nonOwnerTabs} />,
      )
      const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' })
      fireEvent.keyDown(dashboardTab, { key: 'End' })
      expect(onTabChange).toHaveBeenCalledWith('tabletop')
    })
  })

  // --- effectiveActiveTab fallback ---

  describe('effectiveActiveTab fallback', () => {
    const nonOwnerTabs = TABS.filter(t => !t.gmOnly)

    it('falls back to first visible tab when activeTab is not in visibleTabs', () => {
      render(
        <TabNavigation activeTab={'gmscreens' as TabId} onTabChange={() => {}} visibleTabs={nonOwnerTabs} />,
      )
      // Dashboard should be active since gmscreens is not in visibleTabs
      expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('tabindex', '0')
    })

    it('keyboard navigation works correctly with fallback activeTab', () => {
      const onTabChange = vi.fn()
      render(
        <TabNavigation activeTab={'gmscreens' as TabId} onTabChange={onTabChange} visibleTabs={nonOwnerTabs} />,
      )
      // Dashboard is effective active; pressing ArrowRight should go to Tabletop
      const dashboardTab = screen.getByRole('tab', { name: 'Dashboard' })
      fireEvent.keyDown(dashboardTab, { key: 'ArrowRight' })
      expect(onTabChange).toHaveBeenCalledWith('tabletop')
    })
  })
})
