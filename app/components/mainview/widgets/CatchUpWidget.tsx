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
    <h2 className="flex items-center gap-3 font-sans font-semibold text-3xl font-bold tracking-tight text-primary">
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
          <p className="font-sans font-semibold text-xs text-slate-500">Loading catch-up...</p>
        ) : (
          <>
            {error ? (
              <p className="mb-3 font-sans font-semibold text-xs text-rose-400">{error}</p>
            ) : null}

            {markdownContent ? (
              <div
                data-testid="catchup-markdown"
                className="w-full prose prose-invert max-w-none
                  prose-headings:text-slate-200 prose-headings:font-sans font-semibold
                  prose-h1:mb-2 prose-h1:mt-4 prose-h1:text-2xl prose-h1:font-bold prose-h1:text-primary
                  prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-xl prose-h2:font-bold prose-h2:text-primary
                  prose-h3:mb-1 prose-h3:mt-3 prose-h3:text-lg prose-h3:font-semibold
                  prose-h4:mb-1 prose-h4:mt-3 prose-h4:text-base prose-h4:font-semibold
                  prose-h5:mb-1 prose-h5:mt-3 prose-h5:text-sm prose-h5:font-semibold
                  prose-h6:mb-1 prose-h6:mt-3 prose-h6:text-sm
                  prose-p:text-slate-400
                  prose-strong:text-slate-300
                  prose-a:text-blue-brand
                  prose-li:text-slate-400
                  prose-blockquote:text-slate-400 prose-blockquote:border-slate-600
                  prose-th:text-slate-300 prose-td:text-slate-400
                  prose-code:text-slate-300
                  text-xs"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
              </div>
            ) : (
              <p className="font-sans font-semibold text-xs text-slate-500">No catch-up content available</p>
            )}
          </>
        )}
      </div>
    </Widget>
  )
}
