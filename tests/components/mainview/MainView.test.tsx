import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MainView } from '~/components/mainview/MainView'

// Helper to mock matchMedia at a given viewport width
function mockMatchMedia(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => {
      // Only handle the lg breakpoint query used by MainView
      const matches = query === '(min-width: 1024px)' ? width >= 1024 : false
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    }),
  })
}

describe('MainView', () => {
  beforeEach(() => {
    // Default: mobile viewport (< lg), so isDesktop = false in all standard tests
    mockMatchMedia(0)
  })

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

  it('keeps the mobile inspector drawer hidden by default', () => {
    render(
      <MainView>
        <div>Content</div>
      </MainView>
    )
    const inspector = screen.getByTestId('mobile-inspector')
    expect(inspector).toHaveClass('hidden')
    expect(inspector).not.toHaveAttribute('role', 'dialog')
  })

  it('hides inspector when showInspector is false', () => {
    render(
      <MainView showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    expect(screen.queryByTestId('mobile-inspector')).not.toBeInTheDocument()
    expect(screen.queryByTestId('desktop-inspector-shell')).not.toBeInTheDocument()
  })

  it('hides both sidebars when both props are false', () => {
    render(
      <MainView showToolbar={false} showInspector={false}>
        <div>Content</div>
      </MainView>
    )
    expect(screen.getByTestId('mainview-toolbar')).toHaveClass('w-0')
    expect(screen.queryByTestId('mobile-inspector')).not.toBeInTheDocument()
    expect(screen.queryByTestId('desktop-inspector-shell')).not.toBeInTheDocument()
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

  describe('inspector toggle', () => {
    it('shows inspector toggle when showInspector is true', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByTestId('mobile-inspector-toggle')).toBeInTheDocument()
    })

    it('inspector toggle has aria-label "Open inspector" initially', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByRole('button', { name: 'Open inspector' })).toBeInTheDocument()
    })

    it('does not show inspector toggle when showInspector is false', () => {
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
      const inspector = screen.getByTestId('mobile-inspector')
      expect(inspector).not.toHaveAttribute('role', 'dialog')
    })

    it('clicking toggle on mobile opens the drawer (dialog role applied)', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mobile-inspector')).toHaveAttribute('role', 'dialog')
    })

    it('toggle button remains visible and marks aria-expanded after click', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const toggle = screen.getByTestId('mobile-inspector-toggle')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await user.click(toggle)
      expect(screen.getByTestId('mobile-inspector-toggle')).toBeInTheDocument()
      expect(screen.getByTestId('mobile-inspector-toggle')).toHaveAttribute('aria-expanded', 'true')
    })

    it('mobile toggle chevron rotates between closed and open states', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const icon = screen.getByTestId('mobile-inspector-toggle-icon')
      expect(icon).toHaveClass('rotate-0')

      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mobile-inspector-toggle-icon')).toHaveClass('rotate-180')
    })

    it('drawer shows backdrop when open on mobile', async () => {
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
      expect(screen.getByTestId('mobile-inspector')).not.toHaveAttribute('role', 'dialog')
    })

    it('pressing Escape while drawer is open closes the drawer', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mobile-inspector')).toHaveAttribute('role', 'dialog')
      await user.keyboard('{Escape}')
      expect(screen.getByTestId('mobile-inspector')).not.toHaveAttribute('role', 'dialog')
    })

    it('clicking close button inside drawer closes it', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('mobile-inspector-toggle'))
      expect(screen.getByTestId('mobile-inspector')).toHaveAttribute('role', 'dialog')
      await user.click(screen.getByTestId('mobile-inspector-close'))
      expect(screen.getByTestId('mobile-inspector')).not.toHaveAttribute('role', 'dialog')
    })
  })

  describe('desktop inspector toggle', () => {
    beforeEach(() => {
      // Override to desktop viewport for these tests
      mockMatchMedia(1024)
    })

    it('on desktop, inspector is inline and visible by default (lg:w-80 class)', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByTestId('desktop-inspector-shell')).toHaveClass('lg:w-80')
      const inspector = screen.getByTestId('desktop-inspector')
      expect(inspector).toHaveClass('w-80')
    })

    it('on desktop, clicking toggle collapses the inspector shell from the left edge', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const shell = screen.getByTestId('desktop-inspector-shell')
      const inspector = screen.getByTestId('desktop-inspector')
      expect(shell).toHaveClass('lg:w-80')
      expect(inspector).not.toHaveClass('hidden')

      await user.click(screen.getByTestId('desktop-inspector-toggle'))
      expect(shell).toHaveClass('lg:w-0')
      expect(inspector).toHaveClass('hidden')
    })

    it('on desktop, toggle aria-expanded reflects inspectorVisible state', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const toggle = screen.getByTestId('desktop-inspector-toggle')
      // Inspector visible by default on desktop → aria-expanded="true"
      expect(toggle).toHaveAttribute('aria-expanded', 'true')

      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('on desktop, toggling does not open mobile drawer (no dialog role)', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      await user.click(screen.getByTestId('desktop-inspector-toggle'))
      expect(screen.getByTestId('desktop-inspector')).not.toHaveAttribute('role', 'dialog')
    })

    it('on desktop, clicking toggle twice restores inspector visibility', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const toggle = screen.getByTestId('desktop-inspector-toggle')
      await user.click(toggle)
      await user.click(toggle)
      expect(screen.getByTestId('desktop-inspector-shell')).toHaveClass('lg:w-80')
      expect(screen.getByTestId('desktop-inspector')).toHaveClass('w-80')
    })

    it('on desktop, the toggle sits on the left edge of the inspector shell', () => {
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      expect(screen.getByTestId('desktop-inspector-toggle')).toHaveClass('absolute', 'left-0', '-translate-x-full')
    })

    it('on desktop, the chevron rotates to reflect the open state', async () => {
      const user = userEvent.setup()
      render(
        <MainView>
          <div>Content</div>
        </MainView>
      )
      const icon = screen.getByTestId('desktop-inspector-toggle-icon')
      expect(icon).toHaveClass('rotate-180')

      await user.click(screen.getByTestId('desktop-inspector-toggle'))
      expect(screen.getByTestId('desktop-inspector-toggle-icon')).toHaveClass('rotate-0')
    })
  })
})
