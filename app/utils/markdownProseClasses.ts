/**
 * Shared Tailwind prose classes for markdown rendering.
 * Used by MarkdownEditor preview and CatchUpWidget to keep
 * markdown typography visually consistent across the app.
 */
export const MARKDOWN_PROSE_CLASSES = [
  'prose prose-invert max-w-none',
  'prose-headings:text-slate-200 prose-headings:font-sans prose-headings:font-semibold',
  'prose-h1:mb-2 prose-h1:mt-4 prose-h1:text-2xl prose-h1:font-bold prose-h1:text-primary',
  'prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-xl prose-h2:font-bold prose-h2:text-primary',
  'prose-h3:mb-1 prose-h3:mt-3 prose-h3:text-lg prose-h3:font-semibold',
  'prose-h4:mb-1 prose-h4:mt-3 prose-h4:text-base prose-h4:font-semibold',
  'prose-h5:mb-1 prose-h5:mt-3 prose-h5:text-sm prose-h5:font-semibold',
  'prose-h6:mb-1 prose-h6:mt-3 prose-h6:text-sm',
  'prose-p:text-slate-400',
  'prose-strong:text-slate-300',
  'prose-a:text-blue-brand',
  'prose-li:text-slate-400',
  'prose-blockquote:text-slate-400 prose-blockquote:border-slate-600',
  'prose-th:text-slate-300 prose-td:text-slate-400',
  'prose-code:text-slate-300',
].join(' ')
