import { Globe, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleData } from '~/types/rule';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RuleWindowProps {
  rule: RuleData;
}

export function RuleWindow({ rule }: RuleWindowProps) {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto h-full">
      {/* Title */}
      <h2 className="text-sm font-bold text-slate-200">{rule.title}</h2>

      {/* Visibility badge */}
      <div className="flex">
        {rule.isPublic ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
            <Globe className="h-3 w-3" />
            Public
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
            <Lock className="h-3 w-3" />
            Private
          </span>
        )}
      </div>

      {/* Tags */}
      {rule.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rule.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Rendered markdown content */}
      <div className={MARKDOWN_PROSE_CLASSES}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.content}</ReactMarkdown>
      </div>
    </div>
  );
}
