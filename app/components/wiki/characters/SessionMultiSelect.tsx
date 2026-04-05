import React from 'react';
import { X } from 'lucide-react';
import type { CampaignData } from '~/types/campaign';

interface SessionMultiSelectProps {
  sessions: CampaignData['sessions'];
  selectedSessions: string[];
  onToggle: (sessionId: string) => void;
  disabled?: boolean;
}

export function SessionMultiSelect({
  sessions,
  selectedSessions,
  onToggle,
  disabled,
}: SessionMultiSelectProps) {
  return (
    <div>
      <label
        htmlFor="session-multi-select"
        className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide"
      >
        Sessions Appeared In
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selectedSessions.map((sessId) => {
          const sess = sessions.find((s) => s.id === sessId);
          return (
            <span
              key={sessId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold"
            >
              {sess ? `S${sess.number}` : sessId}
              <button
                type="button"
                onClick={() => onToggle(sessId)}
                className="hover:text-white transition-colors"
                aria-label={sess ? `Remove session ${sess.number}` : `Remove session ${sessId}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}
      </div>
      <select
        id="session-multi-select"
        value=""
        onChange={(e) => {
          if (e.target.value) onToggle(e.target.value);
        }}
        disabled={disabled}
        className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
      >
        <option value="">Add session...</option>
        {sessions
          .filter((s) => !selectedSessions.includes(s.id))
          .map((s) => (
            <option key={s.id} value={s.id}>
              Session {s.number}: {s.name}
            </option>
          ))}
      </select>
    </div>
  );
}
