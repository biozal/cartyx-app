import { Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleData } from '~/types/rule';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RuleWindowProps {
  rule: RuleData;
  isGM?: boolean;
  onEdit?: () => void;
}

export function RuleWindow({ rule, isGM, onEdit }: RuleWindowProps) {
  const showMeta = rule.tags.length > 0 || (isGM && !!onEdit);

  return (
    <div className="flex flex-col h-full">
      {showMeta && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05] shrink-0">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {rule.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
          {isGM && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
              aria-label="Edit rule"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        <div className={MARKDOWN_PROSE_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
