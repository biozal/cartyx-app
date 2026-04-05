// TODO: a11y & react-compiler — MarkdownEditor intentionally uses mount-once effect; react-compiler skips optimization here
/* eslint-disable react-compiler/react-compiler */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EditorView, placeholder as cmPlaceholder, keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

export type MarkdownEditorMode = 'edit' | 'preview';

export interface MarkdownEditorProps {
  /** Controlled markdown string. */
  value: string;
  /** Called when the markdown content changes. */
  onChange: (value: string) => void;
  /** Label content rendered above the editor. */
  label?: React.ReactNode;
  /** Placeholder text shown in the editor when empty. */
  placeholder?: string;
  /** Error message — renders red border and text below editor. */
  error?: string;
  /** Hint text rendered below the editor (hidden when error is shown). */
  hint?: string;
  /** Whether the editor is disabled / read-only. */
  disabled?: boolean;
  /** Additional CSS classes applied to the outermost wrapper. */
  className?: string;
  /** Minimum height of the editor area (CSS value). Defaults to "12rem". */
  minHeight?: string;
  /** Optional id forwarded to the editor for label association. */
  id?: string;
  /** Initial mode. Defaults to "edit". */
  defaultMode?: MarkdownEditorMode;
}

const readOnlyCompartment = new Compartment();
const placeholderCompartment = new Compartment();

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    lineHeight: '1.625',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    caretColor: '#85adff',
    padding: '0.75rem 1rem',
    fontFamily: "'Open Sans', system-ui, sans-serif",
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-placeholder': {
    color: '#334155',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(133,173,255,0.2)',
  },
  '.cm-cursor': {
    borderLeftColor: '#85adff',
  },
});

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  error,
  hint,
  disabled = false,
  className = '',
  minHeight = '12rem',
  id,
  defaultMode = 'edit',
}: MarkdownEditorProps) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const labelId = `${editorId}-label`;
  const [mode, setMode] = useState<MarkdownEditorMode>(defaultMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const isProgrammaticRef = useRef(false);
  const editTabRef = useRef<HTMLButtonElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(oneDarkHighlightStyle),
        editorTheme,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        readOnlyCompartment.of(EditorState.readOnly.of(disabled)),
        placeholderCompartment.of(placeholder ? cmPlaceholder(placeholder) : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isProgrammaticRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    // Associate focusable content element with accessible name and role
    view.contentDOM.id = editorId;
    view.contentDOM.setAttribute('role', 'textbox');
    view.contentDOM.setAttribute('aria-multiline', 'true');
    if (label) {
      view.contentDOM.setAttribute('aria-labelledby', labelId);
    }
    if (disabled) {
      view.contentDOM.setAttribute('aria-disabled', 'true');
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once — value/placeholder/disabled handled via separate effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into CodeMirror (guarded to prevent bounce-back)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      isProgrammaticRef.current = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
      isProgrammaticRef.current = false;
    }
  }, [value]);

  // Sync disabled/readOnly and aria-disabled
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled)),
    });
    if (disabled) {
      view.contentDOM.setAttribute('aria-disabled', 'true');
    } else {
      view.contentDOM.removeAttribute('aria-disabled');
    }
  }, [disabled]);

  // Sync placeholder reactively
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(placeholder ? cmPlaceholder(placeholder) : []),
    });
  }, [placeholder]);

  // Sync id and aria-labelledby when id/label props change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.contentDOM.id = editorId;
    if (label) {
      view.contentDOM.setAttribute('aria-labelledby', labelId);
    } else {
      view.contentDOM.removeAttribute('aria-labelledby');
    }
  }, [editorId, label, labelId]);

  // Sync aria-describedby and aria-invalid onto the CodeMirror content element
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const el = view.contentDOM;

    const describedBy = error ? `${editorId}-error` : hint ? `${editorId}-hint` : undefined;
    if (describedBy) {
      el.setAttribute('aria-describedby', describedBy);
    } else {
      el.removeAttribute('aria-describedby');
    }

    if (error) {
      el.setAttribute('aria-invalid', 'true');
    } else {
      el.removeAttribute('aria-invalid');
    }
  }, [error, hint, editorId]);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextMode: MarkdownEditorMode | null = null;

    if (e.key === 'ArrowRight' || e.key === 'End') {
      e.preventDefault();
      nextMode = 'preview';
    } else if (e.key === 'ArrowLeft' || e.key === 'Home') {
      e.preventDefault();
      nextMode = 'edit';
    }

    if (nextMode !== null) {
      setMode(nextMode);
      const targetRef = nextMode === 'edit' ? editTabRef : previewTabRef;
      targetRef.current?.focus();
    }
  }, []);

  const borderCls = error
    ? 'border-red-500/50 focus-within:border-red-500/70'
    : 'border-white/10 focus-within:border-blue-500/50';

  const wrapperCls = [
    'rounded-xl border overflow-hidden transition-all',
    borderCls,
    disabled ? 'opacity-50' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperCls}>
      {label && (
        // TODO: a11y — label span click-to-focus needs keyboard handler; consider using a <label> element
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <span
          id={labelId}
          className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide px-4 pt-3 cursor-pointer"
          onClick={() => viewRef.current?.focus()}
        >
          {label}
        </span>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-white/10" role="tablist" aria-label="Editor mode">
        <button
          ref={editTabRef}
          type="button"
          role="tab"
          aria-selected={mode === 'edit'}
          aria-controls={`${editorId}-edit-panel`}
          id={`${editorId}-edit-tab`}
          tabIndex={mode === 'edit' ? 0 : -1}
          onClick={() => setMode('edit')}
          onKeyDown={handleTabKeyDown}
          className={[
            'px-4 py-2 text-xs font-semibold tracking-wide transition-colors',
            mode === 'edit'
              ? 'text-primary border-b-2 border-primary'
              : 'text-slate-500 hover:text-slate-300',
          ].join(' ')}
        >
          Edit
        </button>
        <button
          ref={previewTabRef}
          type="button"
          role="tab"
          aria-selected={mode === 'preview'}
          aria-controls={`${editorId}-preview-panel`}
          id={`${editorId}-preview-tab`}
          tabIndex={mode === 'preview' ? 0 : -1}
          onClick={() => setMode('preview')}
          onKeyDown={handleTabKeyDown}
          className={[
            'px-4 py-2 text-xs font-semibold tracking-wide transition-colors',
            mode === 'preview'
              ? 'text-primary border-b-2 border-primary'
              : 'text-slate-500 hover:text-slate-300',
          ].join(' ')}
        >
          Preview
        </button>
      </div>

      {/* Edit panel */}
      <div
        id={`${editorId}-edit-panel`}
        role="tabpanel"
        aria-labelledby={`${editorId}-edit-tab`}
        hidden={mode !== 'edit'}
        style={{ minHeight }}
      >
        <div ref={containerRef} data-testid="cm-editor" style={{ minHeight }} />
      </div>

      {/* Preview panel */}
      <div
        id={`${editorId}-preview-panel`}
        role="tabpanel"
        aria-labelledby={`${editorId}-preview-tab`}
        hidden={mode !== 'preview'}
        className="px-4 py-3"
        style={{ minHeight }}
      >
        {value.trim() ? (
          <div className={`${MARKDOWN_PROSE_CLASSES} text-sm`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-slate-700 text-sm italic">Nothing to preview</p>
        )}
      </div>

      {/* Error / hint */}
      {error && (
        <p id={`${editorId}-error`} className="text-xs text-red-400 mt-1.5 px-4 pb-3" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${editorId}-hint`} className="text-xs text-slate-600 mt-1.5 px-4 pb-3">
          {hint}
        </p>
      )}
    </div>
  );
}
