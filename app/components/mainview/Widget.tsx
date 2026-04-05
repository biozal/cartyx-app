import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronDown, Maximize2, X } from 'lucide-react';

/** Shared styles used by both Widget and WidgetSlot */
export const WIDGET_STYLES = {
  section: 'rounded-lg border border-outline-variant bg-surface-container p-6',
  header: 'flex items-center justify-between mb-6',
  title: 'font-sans font-semibold text-[11px] text-primary uppercase tracking-widest',
  content: 'min-h-[200px]',
} as const;

export interface WidgetProps {
  title: string;
  /** Optional custom header content. When provided, replaces the default title text. */
  headerContent?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultMinimized?: boolean;
}

export function Widget({
  title,
  headerContent,
  children,
  className = '',
  defaultMinimized = false,
}: WidgetProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const titleId = useId();

  const toggleMinimized = useCallback(() => {
    setIsMinimized((current) => !current);
  }, []);

  const openFullscreen = useCallback(() => {
    setIsFullscreen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFullscreen();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, closeFullscreen]);

  return (
    <>
      <section className={`${WIDGET_STYLES.section} ${className}`}>
        <header className={WIDGET_STYLES.header}>
          {/* Title area — double-click toggles minimize */}
          <div
            className="flex items-center gap-2 flex-1 cursor-default select-none"
            onDoubleClick={toggleMinimized}
          >
            {isMinimized ? (
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
            ) : null}
            {headerContent ? (
              <>
                {headerContent}
                {/* Ensure an element with id={titleId} always exists for aria-labelledby */}
                <h2 id={titleId} className="sr-only">
                  {title}
                </h2>
              </>
            ) : (
              <h2 id={titleId} className={WIDGET_STYLES.title}>
                {title}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Explicit minimize toggle for touch/keyboard accessibility */}
            <button
              type="button"
              onClick={toggleMinimized}
              className="text-slate-500 transition-colors hover:text-white"
              aria-label={isMinimized ? `Expand ${title}` : `Minimize ${title}`}
              aria-expanded={!isMinimized}
            >
              {isMinimized ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFullscreen();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="text-slate-500 transition-colors hover:text-white"
              aria-label={`Open ${title} in fullscreen`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Hide in-card content when fullscreen to avoid duplicate mount */}
        {!isMinimized && !isFullscreen ? (
          <div className={WIDGET_STYLES.content}>{children}</div>
        ) : null}
      </section>

      {isFullscreen
        ? createPortal(
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-dismiss and Escape-to-close are standard modal dialog patterns
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeFullscreen();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeFullscreen();
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div
                className={`max-h-[90vh] w-full max-w-4xl overflow-auto ${WIDGET_STYLES.section}`}
              >
                <header className={WIDGET_STYLES.header}>
                  <h2 className={WIDGET_STYLES.title}>{title}</h2>

                  <button
                    type="button"
                    onClick={closeFullscreen}
                    className="text-slate-500 transition-colors hover:text-white"
                    aria-label={`Close ${title} fullscreen`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </header>

                <div className={WIDGET_STYLES.content}>{children}</div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
