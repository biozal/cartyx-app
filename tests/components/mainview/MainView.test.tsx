import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MainView } from '~/components/mainview/MainView'

describe('MainView', () => {
  it('renders children', () => {
    render(
      <MainView>
        <div>Test Content</div>
      </MainView>
    )
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('hides toolbar by default', () => {
    render(
      <MainView>
        <div>Content</div>
      </MainView>
    )
    const toolbar = screen.getByTestId('mainview-toolbar')
    expect(toolbar).toHaveClass('w-0')
    expect(toolbar).not.toHaveClass('w-14')
  })

  it('shows toolbar when showToolbar is true', () => {
    render(
      <MainView showToolbar>
        <div>Content</div>
      </MainView>
    )
    const toolbar = screen.getByTestId('mainview-toolbar')
    expect(toolbar).toHaveClass('w-14')
    expect(toolbar).not.toHaveClass('w-0')
  })

  it('shows inspector by default (lg breakpoint class)', () => {
    render(
      <MainView>
        <div>Content</div>
      </MainView>
    )
    const inspector = screen.getByTestId('mainview-inspector')
    expect(inspector).toHaveClass('lg:w-80')
    expect(inspector).not.toHaveClass('lg:w-0')
  })

  it('hides inspector when showInspector is false (lg breakpoint class)', () => {
    render(
      <MainView showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    const inspector = screen.getByTestId('mainview-inspector')
    expect(inspector).toHaveClass('lg:w-0')
    expect(inspector).not.toHaveClass('lg:w-80')
  })

  it('hides both sidebars when both props are false', () => {
    render(
      <MainView showToolbar={false} showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    expect(screen.getByTestId('mainview-toolbar')).toHaveClass('w-0')
    expect(screen.getByTestId('mainview-inspector')).toHaveClass('lg:w-0')
  })

  it('toolbar toggle is not in DOM when showToolbar is false', () => {
    render(
      <MainView showToolbar={false}>
        <div>Content</div>
      </MainView>
    )
    expect(screen.queryByTestId('toolbar-toggle')).not.toBeInTheDocument()
  })

  it('toolbar toggle is present when showToolbar is true', () => {
    render(
      <MainView showToolbar>
        <div>Content</div>
      </MainView>
    )
    expect(screen.getByTestId('toolbar-toggle')).toBeInTheDocument()
  })

  it('clicking toolbar toggle collapses toolbar from w-14 to w-8', async () => {
    const user = userEvent.setup()
    render(
      <MainView showToolbar>
        <div>Content</div>
      </MainView>
    )
    const toolbar = screen.getByTestId('mainview-toolbar')
    expect(toolbar).toHaveClass('w-14')

    await user.click(screen.getByTestId('toolbar-toggle'))
    expect(toolbar).toHaveClass('w-8')
  })

  it('clicking toolbar toggle twice restores toolbar to w-14', async () => {
    const user = userEvent.setup()
    render(
      <MainView showToolbar>
        <div>Content</div>
      </MainView>
    )
    const toggle = screen.getByTestId('toolbar-toggle')
    await user.click(toggle)
    await user.click(toggle)
    expect(screen.getByTestId('mainview-toolbar')).toHaveClass('w-14')
  })

  describe('mobile inspector', () => {
    it('shows mobile toggle button when showInspector is true', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByTestId('mobile-inspector-toggle')).toBeInTheDocument()
    })

    it('mobile toggle button has aria-label "Open inspector"', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByRole('button', { name: 'Open inspector' })).toBeInTheDocument()
    })

    it('does not show mobile toggle button when showInspector is false', () => {
      render(
        <MainView showInspector={false}>
          <div>Content</div>
        </MainView>
      )
      expect(screen.queryByTestId('mobile-inspector-toggle')).not.toBeInTheDocument()
    })

    it('mobile drawer is hidden by default (no dialog role)', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const inspector = screen.getByTestId('mainview-inspector')
      expect(inspector).not.toHaveAttribute('role', 'dialog')
    })

    it('clicking mobile toggle opens the drawer (dialog role applied)', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mainview-inspector')).toHaveAttribute('role', 'dialog')
    })

    it('clicking mobile toggle hides the toggle button', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.queryByTestId('mobile-inspector-toggle')).not.toBeInTheDocument()
    })

    it('drawer shows backdrop when open', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mobile-inspector-backdrop')).toBeInTheDocument()
    })

    it('clicking backdrop closes the drawer', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      await user.click(screen.getByTestId('mobile-inspector-backdrop'))
      expect(screen.getByTestId('mainview-inspector')).not.toHaveAttribute('role', 'dialog')
    })

    it('clicking close button inside drawer closes it', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mainview-inspector')).toHaveAttribute('role', 'dialog')
      await user.click(screen.getByTestId('mobile-inspector-close'))
      expect(screen.getByTestId('mainview-inspector')).not.toHaveAttribute('role', 'dialog')
    })
  })
})
