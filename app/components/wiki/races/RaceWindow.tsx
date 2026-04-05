import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RaceData } from '~/types/race';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RaceWindowProps {
  race: RaceData;
}

export function RaceWindow({ race }: RaceWindowProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.07] shrink-0">
        <h2 className="text-sm font-bold text-slate-100 tracking-wide">{race.title}</h2>
        {race.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {race.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable markdown content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className={MARKDOWN_PROSE_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{race.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
