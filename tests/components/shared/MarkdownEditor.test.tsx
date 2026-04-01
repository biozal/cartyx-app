import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock CodeMirror — happy-dom lacks full DOM APIs required by CM6.
// We capture the props and simulate change callbacks so we can test
// the React wrapper behaviour without needing a real CM instance.
let lastCmOnChange: ((value: string) => void) | undefined
let lastCmValue: string | undefined

vi.mock('@codemirror/view', () => {
  class FakeEditorView {
    dom: HTMLDivElement
    state = { doc: { toString: () => lastCmValue ?? '' } }

    constructor(opts: { state: { doc: string }; parent: HTMLElement }) {
      lastCmValue = opts.state.doc
      this.dom = document.createElement('div')
      this.dom.setAttribute('data-testid', 'cm-mock')
      opts.parent.appendChild(this.dom)
    }
    dispatch(tr: { changes?: { insert: string }; effects?: unknown }) {
      if (tr.changes) {
        lastCmValue = tr.changes.insert
      }
    }
    destroy() {}
  }

  return {
    EditorView: Object.assign(FakeEditorView, {
      theme: () => [],
      updateListener: { of: (fn: (u: { docChanged: boolean; state: { doc: { toString: () => string } } }) => void) => {
        // Capture the listener so tests can trigger changes
        lastCmOnChange = (val: string) => fn({ docChanged: true, state: { doc: { toString: () => val } } })
        return []
      }},
      lineWrapping: [],
    }),
    placeholder: () => [],
    keymap: { of: () => [] },
  }
})

vi.mock('@codemirror/state', () => {
  class FakeCompartment {
    of(ext: unknown) { return ext }
    reconfigure(ext: unknown) { return ext }
  }
  return {
    EditorState: {
      create: (opts: { doc: string }) => ({ doc: opts.doc }),
      readOnly: { of: () => [] },
    },
    Compartment: FakeCompartment,
  }
})

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => [],
  markdownLanguage: {},
}))

vi.mock('@codemirror/language-data', () => ({
  languages: [],
}))

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => [],
  historyKeymap: [],
}))

vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: () => [],
}))

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDarkHighlightStyle: {},
}))

import { MarkdownEditor } from '~/components/shared/MarkdownEditor'

beforeEach(() => {
  lastCmOnChange = undefined
  lastCmValue = undefined
})

describe('MarkdownEditor', () => {
  // ── Rendering ────────────────────────────────────────────

  it('renders with Edit and Preview tabs', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
  })

  it('renders the label when provided', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} label="Content" />)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('starts in edit mode by default', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    const editTab = screen.getByRole('tab', { name: 'Edit' })
    expect(editTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { hidden: false })).not.toHaveAttribute('hidden')
  })

  it('respects defaultMode="preview"', () => {
    render(<MarkdownEditor value="# Hello" onChange={vi.fn()} defaultMode="preview" />)
    const previewTab = screen.getByRole('tab', { name: 'Preview' })
    expect(previewTab).toHaveAttribute('aria-selected', 'true')
  })

  // ── Tab switching ────────────────────────────────────────

  it('switches to preview mode when Preview tab is clicked', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="**bold**" onChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'false')
  })

  it('switches tabs via arrow keys', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="" onChange={vi.fn()} />)

    const editTab = screen.getByRole('tab', { name: 'Edit' })
    editTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')

    const previewTab = screen.getByRole('tab', { name: 'Preview' })
    previewTab.focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true')
  })

  // ── Preview rendering ────────────────────────────────────

  it('renders markdown content in preview mode', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="# Hello World" onChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('shows empty state when value is blank in preview', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="" onChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText('Nothing to preview')).toBeInTheDocument()
  })

  it('renders GFM features like tables in preview', async () => {
    const user = userEvent.setup()
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    render(<MarkdownEditor value={md} onChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  // ── Controlled value ─────────────────────────────────────

  it('calls onChange when the editor content changes', () => {
    const handleChange = vi.fn()
    render(<MarkdownEditor value="" onChange={handleChange} />)

    // Simulate a CodeMirror change via the captured listener
    expect(lastCmOnChange).toBeDefined()
    lastCmOnChange!('new content')
    expect(handleChange).toHaveBeenCalledWith('new content')
  })

  it('syncs external value changes into the editor', () => {
    const { rerender } = render(<MarkdownEditor value="initial" onChange={vi.fn()} />)
    expect(lastCmValue).toBe('initial')

    rerender(<MarkdownEditor value="updated" onChange={vi.fn()} />)
    expect(lastCmValue).toBe('updated')
  })

  // ── Error / hint display ─────────────────────────────────

  it('renders error message with alert role', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} error="Required" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Required')
  })

  it('applies error border styling', () => {
    const { container } = render(<MarkdownEditor value="" onChange={vi.fn()} error="Bad" />)
    expect(container.firstChild).toHaveClass('border-red-500/50')
  })

  it('renders hint when no error is present', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} hint="Supports markdown" />)
    expect(screen.getByText('Supports markdown')).toBeInTheDocument()
  })

  it('hides hint when error is present', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} error="Error" hint="Supports markdown" />)
    expect(screen.queryByText('Supports markdown')).not.toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  // ── Disabled state ───────────────────────────────────────

  it('applies disabled styling', () => {
    const { container } = render(<MarkdownEditor value="" onChange={vi.fn()} disabled />)
    expect(container.firstChild).toHaveClass('opacity-50')
  })

  // ── Layout / responsive ──────────────────────────────────

  it('applies custom minHeight', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} minHeight="20rem" />)
    const panels = document.querySelectorAll<HTMLElement>('[role="tabpanel"]')
    panels.forEach((panel) => {
      expect(panel.style.minHeight).toBe('20rem')
    })
  })

  it('applies additional className to wrapper', () => {
    const { container } = render(
      <MarkdownEditor value="" onChange={vi.fn()} className="w-full max-w-2xl" />,
    )
    expect(container.firstChild).toHaveClass('w-full')
    expect(container.firstChild).toHaveClass('max-w-2xl')
  })

  // ── Accessibility ────────────────────────────────────────

  it('has proper tablist and tabpanel ARIA attributes', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Editor mode')

    const editTab = screen.getByRole('tab', { name: 'Edit' })
    const editPanelId = editTab.getAttribute('aria-controls')
    expect(editPanelId).toBeTruthy()
    expect(document.getElementById(editPanelId!)).toBeInTheDocument()
  })
})
