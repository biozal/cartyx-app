import { useEffect, useState } from 'react'
import { faBookOpen } from '@fortawesome/pro-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Widget } from '~/components/mainview/Widget'
import { getCatchUpContent, type CatchUpContent } from '~/services/mocks/catchUpService'

const emptyCatchUpContent: CatchUpContent = {
  title: 'Session Catch-Up',
  lastUpdated: '',
  content: '',
}

export function CatchUpWidget({
  className = '',
  content,
}: {
  className?: string
  content?: CatchUpContent
}) {
  const [resolvedContent, setResolvedContent] = useState<CatchUpContent | null>(content ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (content) {
      setResolvedContent(content)
      setError(null)
      return
    }

    let isMounted = true
    setError(null)

    void getCatchUpContent()
      .then((nextContent) => {
        if (isMounted) {
          setResolvedContent(nextContent)
        }
      })
      .catch((error) => {
        console.error(error)
        if (isMounted) {
          setError('Unable to load catch-up content.')
          setResolvedContent(emptyCatchUpContent)
        }
      })

    return () => {
      isMounted = false
    }
  }, [content])

  const markdownContent = resolvedContent?.content ?? ''

  const customHeader = (
    <h2 className="flex items-center gap-3 font-pixel text-3xl font-bold tracking-tight text-primary">
      <FontAwesomeIcon icon={faBookOpen} className="text-xl" />
      CATCH UP
    </h2>
  )

  return (
    <Widget
      title="Session Catch-Up"
      headerContent={customHeader}
      className={`group relative col-span-full overflow-hidden border-0 rounded-none border-l-2 border-primary/50 bg-surface-container-high/40 ${className}`}
    >
      <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
        <FontAwesomeIcon icon={faBookOpen} className="text-9xl text-primary" aria-hidden="true" />
      </div>

      <div
        data-testid="catchup-scroll"
        className="max-h-[400px] overflow-y-auto"
      >
        {resolvedContent === null ? (
          <p className="font-body text-sm leading-relaxed text-on-surface-variant">Loading catch-up...</p>
        ) : (
          <>
            {error ? (
              <p className="mb-3 font-body text-sm leading-relaxed text-rose-400">{error}</p>
            ) : null}

            {markdownContent ? (
              <div
                data-testid="catchup-markdown"
                className="w-full max-w-none space-y-4 font-body text-sm leading-relaxed text-on-surface-variant"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node: _node, className, ...props }) => (
                      <h1
                        className={`mb-2 mt-4 font-pixel text-2xl font-bold text-primary ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    h2: ({ node: _node, className, ...props }) => (
                      <h2
                        className={`mb-2 mt-4 font-pixel text-xl font-bold text-primary ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    h3: ({ node: _node, className, ...props }) => (
                      <h3
                        className={`mb-1 mt-3 font-pixel text-lg font-semibold text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    h4: ({ node: _node, className, ...props }) => (
                      <h4
                        className={`mb-1 mt-3 font-pixel text-base font-semibold text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    h5: ({ node: _node, className, ...props }) => (
                      <h5
                        className={`mb-1 mt-3 font-pixel text-sm font-semibold text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    h6: ({ node: _node, className, ...props }) => (
                      <h6
                        className={`mb-1 mt-3 font-pixel text-sm text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    p: ({ node: _node, className, ...props }) => (
                      <p
                        className={`font-body text-sm leading-relaxed text-on-surface-variant ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    ul: ({ node: _node, className, ...props }) => (
                      <ul className={`list-disc space-y-2 pl-6 ${className ?? ''}`} {...props} />
                    ),
                    ol: ({ node: _node, className, ...props }) => (
                      <ol className={`list-decimal space-y-2 pl-6 ${className ?? ''}`} {...props} />
                    ),
                    li: ({ node: _node, className, ...props }) => (
                      <li
                        className={`font-body text-sm leading-relaxed text-on-surface-variant ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    strong: ({ node: _node, className, ...props }) => (
                      <strong className={`font-semibold text-slate-200 ${className ?? ''}`} {...props} />
                    ),
                    a: ({ node: _node, className, ...props }) => (
                      <a className={`text-primary underline underline-offset-2 ${className ?? ''}`} {...props} />
                    ),
                    blockquote: ({ node: _node, className, ...props }) => (
                      <blockquote
                        className={`border-l-2 border-primary/40 pl-4 italic text-on-surface-variant ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    code: ({ node: _node, className, ...props }) => (
                      <code
                        className={`rounded bg-black/20 px-1 py-0.5 text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    table: ({ node: _node, className, ...props }) => (
                      <table className={`w-full border-collapse text-left ${className ?? ''}`} {...props} />
                    ),
                    th: ({ node: _node, className, ...props }) => (
                      <th
                        className={`border-b border-white/10 px-2 py-1 font-pixel text-xs text-slate-200 ${className ?? ''}`}
                        {...props}
                      />
                    ),
                    td: ({ node: _node, className, ...props }) => (
                      <td
                        className={`border-b border-white/5 px-2 py-1 align-top font-body text-sm text-on-surface-variant ${className ?? ''}`}
                        {...props}
                      />
                    ),
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">No catch-up content available</p>
            )}
          </>
        )}
      </div>
    </Widget>
  )
}
