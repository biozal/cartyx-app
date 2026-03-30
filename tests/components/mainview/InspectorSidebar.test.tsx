import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InspectorSidebar } from '~/components/mainview/InspectorSidebar'

// Env var names used per-environment (set in Vercel)
const { DEV_FLAGS, enabledFlags } = vi.hoisted(() => {
  const DEV_FLAGS = {
    chat: 'dev-inspector-chat',
    notepad: 'dev-inspector-notepad',
    settings: 'dev-inspector-settings',
  }

  // Which flags PostHog reports as enabled
  const enabledFlags = new Set<string>([
    DEV_FLAGS.chat,
    DEV_FLAGS.notepad,
    DEV_FLAGS.settings,
  ])

  return { DEV_FLAGS, enabledFlags }
})
vi.mock('~/utils/featureFlags', () => ({
  useOptionalFeatureFlagEnabled: (flag: string) => Boolean(flag) && enabledFlags.has(flag),
}))

beforeEach(() => {
  vi.stubEnv('VITE_PUBLIC_FF_CHAT', DEV_FLAGS.chat)
  vi.stubEnv('VITE_PUBLIC_FF_NOTEPAD', DEV_FLAGS.notepad)
  vi.stubEnv('VITE_PUBLIC_FF_SETTINGS', DEV_FLAGS.settings)
  enabledFlags.add(DEV_FLAGS.chat)
  enabledFlags.add(DEV_FLAGS.notepad)
  enabledFlags.add(DEV_FLAGS.settings)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('InspectorSidebar', () => {
  it('defaults to the chat tab', () => {
    render(<InspectorSidebar />)
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByRole('combobox', { name: 'Session selector' })
    )
  })

  it('renders all 4 tab buttons when all flags are enabled', () => {
    render(<InspectorSidebar />)
    expect(screen.getByTestId('inspector-tab-chat')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-notepad')).toBeInTheDocument()
    expect(screen.getByTestId('inspector-tab-settings')).toBeInTheDocument()
  })

  it('switches to wiki panel when wiki tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-wiki'))
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByRole('button', { name: 'Characters' })
    )
  })

  it('switches to notepad panel when notepad tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-notepad'))
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByTestId('notepad-panel')
    )
    expect(screen.getByRole('heading', { name: 'Notepad' })).toBeInTheDocument()
    expect(screen.getByTestId('notepad-panel')).toHaveTextContent('Coming Soon')
  })

  it('switches to settings panel when settings tab is clicked', async () => {
    const user = userEvent.setup()
    render(<InspectorSidebar />)
    await user.click(screen.getByTestId('inspector-tab-settings'))
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByTestId('settings-panel')
    )
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-panel')).toHaveTextContent('Coming Soon')
  })

  it('respects defaultTab prop', () => {
    render(<InspectorSidebar defaultTab="notepad" />)
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByTestId('notepad-panel')
    )
  })

  it('active tab has aria-selected=true', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    expect(screen.getByTestId('inspector-tab-chat')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('inspector-tab-wiki')).toHaveAttribute('aria-selected', 'false')
  })

  it('only active tab is tabbable (roving tabindex)', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    expect(screen.getByTestId('inspector-tab-chat')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('inspector-tab-wiki')).toHaveAttribute('tabindex', '-1')
  })

  it('has proper tablist role', () => {
    render(<InspectorSidebar />)
    expect(screen.getByRole('tablist', { name: 'Inspector panels' })).toBeInTheDocument()
  })

  it('arrow keys navigate between tabs', () => {
    render(<InspectorSidebar defaultTab="chat" />)
    const chatTab = screen.getByTestId('inspector-tab-chat')
    fireEvent.keyDown(chatTab, { key: 'ArrowRight' })
    expect(screen.getByTestId('inspector-panel')).toContainElement(
      screen.getByRole('button', { name: 'Characters' })
    )
  })

  it('tab buttons have type=button', () => {
    render(<InspectorSidebar />)
    const buttons = screen.getAllByRole('tab')
    buttons.forEach(btn => {
      expect(btn).toHaveAttribute('type', 'button')
    })
  })

  describe('feature flags', () => {
    it('hides chat tab when VITE_PUBLIC_FF_CHAT env var is not set', () => {
      vi.stubEnv('VITE_PUBLIC_FF_CHAT', '')
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-chat')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('hides notepad tab when VITE_PUBLIC_FF_NOTEPAD env var is not set', () => {
      vi.stubEnv('VITE_PUBLIC_FF_NOTEPAD', '')
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-notepad')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('hides settings tab when VITE_PUBLIC_FF_SETTINGS env var is not set', () => {
      vi.stubEnv('VITE_PUBLIC_FF_SETTINGS', '')
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-settings')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('hides chat tab when the PostHog flag is disabled', () => {
      enabledFlags.delete(DEV_FLAGS.chat)
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-chat')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('hides notepad tab when the PostHog flag is disabled', () => {
      enabledFlags.delete(DEV_FLAGS.notepad)
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-notepad')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('hides settings tab when the PostHog flag is disabled', () => {
      enabledFlags.delete(DEV_FLAGS.settings)
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-settings')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('falls back to wiki when defaultTab is chat and chat flag is disabled', () => {
      enabledFlags.delete(DEV_FLAGS.chat)
      render(<InspectorSidebar defaultTab="chat" />)
      expect(screen.getByTestId('inspector-panel')).toContainElement(
        screen.getByRole('button', { name: 'Characters' })
      )
    })

    it('only shows wiki when all flagged tabs are disabled', () => {
      enabledFlags.clear()
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('inspector-tab-chat')).not.toBeInTheDocument()
      expect(screen.queryByTestId('inspector-tab-notepad')).not.toBeInTheDocument()
      expect(screen.queryByTestId('inspector-tab-settings')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toBeInTheDocument()
    })

    it('switches active panel to wiki when the active tab flag is toggled off at runtime', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<InspectorSidebar defaultTab="chat" />)

      // Chat tab is active on first render
      await user.click(screen.getByTestId('inspector-tab-chat'))
      expect(screen.getByTestId('inspector-tab-chat')).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('inspector-panel')).toContainElement(
        screen.getByRole('combobox', { name: 'Session selector' })
      )

      // Simulate PostHog toggling the chat flag off
      enabledFlags.delete(DEV_FLAGS.chat)
      rerender(<InspectorSidebar defaultTab="chat" />)

      // Chat tab should disappear and wiki panel should now be active
      expect(screen.queryByTestId('inspector-tab-chat')).not.toBeInTheDocument()
      expect(screen.getByTestId('inspector-tab-wiki')).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('inspector-panel')).toContainElement(
        screen.getByRole('button', { name: 'Characters' })
      )
    })
  })

  describe('mobile close button', () => {
    it('does not render close button when onMobileClose is not provided', () => {
      render(<InspectorSidebar />)
      expect(screen.queryByTestId('mobile-inspector-close')).not.toBeInTheDocument()
    })

    it('renders close button when onMobileClose is provided', () => {
      render(<InspectorSidebar onMobileClose={() => {}} />)
      expect(screen.getByTestId('mobile-inspector-close')).toBeInTheDocument()
    })

    it('close button has aria-label "Close inspector"', () => {
      render(<InspectorSidebar onMobileClose={() => {}} />)
      expect(screen.getByRole('button', { name: 'Close inspector' })).toBeInTheDocument()
    })

    it('calls onMobileClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onMobileClose = vi.fn()
      render(<InspectorSidebar onMobileClose={onMobileClose} />)
      await user.click(screen.getByTestId('mobile-inspector-close'))
      expect(onMobileClose).toHaveBeenCalledOnce()
    })

    it('close button has type=button', () => {
      render(<InspectorSidebar onMobileClose={() => {}} />)
      expect(screen.getByTestId('mobile-inspector-close')).toHaveAttribute('type', 'button')
    })
  })
})
