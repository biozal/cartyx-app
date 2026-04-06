import { faBookOpen } from '@fortawesome/pro-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Widget } from '~/components/mainview/Widget';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

export function CatchUpWidget({
  className = '',
  catchUp,
}: {
  className?: string;
  catchUp: string | null;
}) {
  const markdownContent = catchUp ?? '';

  const customHeader = (
    <h2 className="flex items-center gap-3 font-sans text-3xl font-bold tracking-tight text-primary">
      <FontAwesomeIcon icon={faBookOpen} className="text-xl" />
      CATCH UP
    </h2>
  );

  return (
    <Widget
      title="Session Catch-Up"
      headerContent={customHeader}
      className={`group relative col-span-full overflow-hidden border-0 rounded-none border-l-2 border-primary/50 bg-surface-container-high/40 ${className}`}
    >
      <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
        <FontAwesomeIcon icon={faBookOpen} className="text-9xl text-primary" aria-hidden="true" />
      </div>

      <div data-testid="catchup-scroll" className="max-h-[400px] overflow-y-auto">
        {markdownContent ? (
          <div
            data-testid="catchup-markdown"
            className={`w-full ${MARKDOWN_PROSE_CLASSES} text-xs`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
          </div>
        ) : (
          <p className="font-sans font-semibold text-xs text-slate-500">
            No catch-up content available
          </p>
        )}
      </div>
    </Widget>
  );
}
