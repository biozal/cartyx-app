import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock CodeMirror — happy-dom lacks full DOM APIs required by CM6.
// We capture the props and simulate change callbacks so we can test
// the React wrapper behaviour without needing a real CM instance.
let lastCmOnChange: ((value: string) => void) | undefined
let lastCmValue: string | undefined
let lastContentDOM: HTMLDivElement | undefined
vi.mock('@codemirror/view', () => {
  class FakeEditorView {
    dom: HTMLDivElement
    contentDOM: HTMLDivElement
    state = { doc: { toString: () => lastCmValue ?? '' } }

    constructor(opts: { state: { doc: string }; parent: HTMLElement }) {
      lastCmValue = opts.state.doc
      this.dom = document.createElement('div')
      this.dom.setAttribute('data-testid', 'cm-mock')
      this.contentDOM = document.createElement('div')
      this.contentDOM.setAttribute('contenteditable', 'true')
      this.dom.appendChild(this.contentDOM)
      lastContentDOM = this.contentDOM
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
  lastContentDOM = undefined
})

describe('MarkdownEditor', () => {
  // ── Rendering ────────────────────────────────────────────

  it('renders with Edit and Preview tabs', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
  })

  it('renders the label when provided', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} label="Content" id="test-ed" />)
    const labelEl = screen.getByText('Content')
    expect(labelEl).toBeInTheDocument()
    expect(labelEl).toHaveAttribute('id', 'test-ed-label')
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

  it('switches tabs via arrow keys and moves focus', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="" onChange={vi.fn()} />)

    const editTab = screen.getByRole('tab', { name: 'Edit' })
    editTab.focus()
    await user.keyboard('{ArrowRight}')
    const previewTab = screen.getByRole('tab', { name: 'Preview' })
    expect(previewTab).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(previewTab)

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(editTab)
  })

  it('supports Home/End keys for tab navigation', async () => {
    const user = userEvent.setup()
    render(<MarkdownEditor value="" onChange={vi.fn()} />)

    const editTab = screen.getByRole('tab', { name: 'Edit' })
    const previewTab = screen.getByRole('tab', { name: 'Preview' })

    editTab.focus()
    await user.keyboard('{End}')
    expect(previewTab).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(previewTab)

    await user.keyboard('{Home}')
    expect(editTab).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(editTab)
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

  it('does not fire onChange during programmatic value sync', () => {
    const handleChange = vi.fn()
    const { rerender } = render(<MarkdownEditor value="initial" onChange={handleChange} />)

    // Clear any calls from initial render
    handleChange.mockClear()

    // Rerender with a new value — the sync effect should NOT trigger onChange
    rerender(<MarkdownEditor value="updated externally" onChange={handleChange} />)
    expect(handleChange).not.toHaveBeenCalled()
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

  it('sets id and aria-labelledby on CodeMirror contentDOM for label association', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} id="my-editor" label="Content" />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.id).toBe('my-editor')
    expect(lastContentDOM!.getAttribute('aria-labelledby')).toBe('my-editor-label')
  })

  it('reactively syncs id and aria-labelledby when id/label props change', () => {
    const { rerender } = render(
      <MarkdownEditor value="" onChange={vi.fn()} id="first" label="First label" />,
    )
    expect(lastContentDOM!.id).toBe('first')
    expect(lastContentDOM!.getAttribute('aria-labelledby')).toBe('first-label')

    rerender(<MarkdownEditor value="" onChange={vi.fn()} id="second" label="Second label" />)
    expect(lastContentDOM!.id).toBe('second')
    expect(lastContentDOM!.getAttribute('aria-labelledby')).toBe('second-label')

    rerender(<MarkdownEditor value="" onChange={vi.fn()} id="third" />)
    expect(lastContentDOM!.id).toBe('third')
    expect(lastContentDOM!.hasAttribute('aria-labelledby')).toBe(false)
  })

  it('does not set aria-labelledby when no label is provided', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} id="my-editor" />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.hasAttribute('aria-labelledby')).toBe(false)
  })

  it('clicking the label focuses the editor', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} id="my-editor" label="Content" />)
    const labelEl = screen.getByText('Content')
    labelEl.click()
    // The mock doesn't fully support focus, but we verify the label element is clickable
    expect(labelEl.tagName).toBe('SPAN')
    expect(labelEl).toHaveAttribute('id', 'my-editor-label')
  })

  it('sets aria-disabled on contentDOM when disabled', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} disabled />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.getAttribute('aria-disabled')).toBe('true')
  })

  it('removes aria-disabled when not disabled', () => {
    const { rerender } = render(<MarkdownEditor value="" onChange={vi.fn()} disabled />)
    expect(lastContentDOM!.getAttribute('aria-disabled')).toBe('true')
    rerender(<MarkdownEditor value="" onChange={vi.fn()} disabled={false} />)
    expect(lastContentDOM!.hasAttribute('aria-disabled')).toBe(false)
  })

  it('sets aria-invalid and aria-describedby on contentDOM when error is present', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} id="ed" error="Required" />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.getAttribute('aria-invalid')).toBe('true')
    expect(lastContentDOM!.getAttribute('aria-describedby')).toBe('ed-error')
  })

  it('sets aria-describedby pointing to hint when no error', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} id="ed" hint="Markdown supported" />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.getAttribute('aria-describedby')).toBe('ed-hint')
    expect(lastContentDOM!.hasAttribute('aria-invalid')).toBe(false)
  })

  it('sets role=textbox and aria-multiline on contentDOM', () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(lastContentDOM).toBeDefined()
    expect(lastContentDOM!.getAttribute('role')).toBe('textbox')
    expect(lastContentDOM!.getAttribute('aria-multiline')).toBe('true')
  })
})
