import { useEffect, useState } from 'react'
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

  const title = resolvedContent?.title ?? 'Session Catch-Up'
  const markdownContent = resolvedContent?.content ?? ''

  return (
    <Widget title={title} className={`${className} col-span-full`}>
      <div
        data-testid="catchup-scroll"
        className="max-h-[400px] overflow-y-auto"
      >
        {resolvedContent === null ? (
          <p className="font-pixel text-xs text-slate-500">Loading catch-up...</p>
        ) : (
          <>
            {error ? (
              <p className="mb-3 font-pixel text-xs text-rose-400">{error}</p>
            ) : null}

            {markdownContent ? (
              <div
                data-testid="catchup-markdown"
                className="prose prose-invert max-w-none
                  prose-headings:text-slate-200 prose-headings:font-pixel
                  prose-p:text-slate-400
                  prose-strong:text-slate-300
                  prose-a:text-[#2563EB]
                  prose-li:text-slate-400
                  prose-blockquote:text-slate-400 prose-blockquote:border-slate-600
                  prose-th:text-slate-300 prose-td:text-slate-400
                  prose-code:text-slate-300
                  text-xs"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node: _node, ...props }) => <h3 {...props} />,
                    h2: ({ node: _node, ...props }) => <h4 {...props} />,
                    h3: ({ node: _node, ...props }) => <h5 {...props} />,
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="font-pixel text-xs text-slate-500">No catch-up content available</p>
            )}
          </>
        )}
      </div>
    </Widget>
  )
}
