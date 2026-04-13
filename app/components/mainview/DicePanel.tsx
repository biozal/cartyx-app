import React, { useEffect, useRef } from 'react';
import { Dice5, ExternalLink } from 'lucide-react';
import type { DiceRollMessage } from '~/hooks/useDiceRolls';

const DAMAGE_FLAG_LABELS: Record<number, string> = {
  2: 'Versatile',
  4: 'Additional',
  8: 'Healing',
  16: 'Critical',
  32: 'Conditional',
};

function RollBreakdown({
  attackRolls,
  damageRolls,
  rollInfo,
}: {
  attackRolls: DiceRollMessage['attackRolls'];
  damageRolls: DiceRollMessage['damageRolls'];
  rollInfo: DiceRollMessage['rollInfo'];
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {rollInfo.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {rollInfo.map(([label, value], i) => (
            <span
              key={i}
              className="rounded bg-white/[0.05] px-2 py-0.5 font-sans text-[10px] text-slate-400"
            >
              {label}: {value}
            </span>
          ))}
        </div>
      )}

      {attackRolls.map((roll, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span
            className="rounded bg-[#0D1117] px-2 py-1 font-mono text-sm font-bold"
            style={{
              color:
                roll.type === 'crit'
                  ? '#ffd740'
                  : roll.type === 'crit-fail'
                    ? '#ef5350'
                    : roll.type === 'miss'
                      ? '#ef5350'
                      : '#69f0ae',
            }}
          >
            {roll.total}
          </span>
          <span className="font-sans text-[11px] text-slate-500">To Hit</span>
          {roll.type === 'crit' && (
            <span className="font-sans text-[10px] font-bold text-yellow-400">CRIT!</span>
          )}
          {roll.type === 'crit-fail' && (
            <span className="font-sans text-[10px] font-bold text-red-400">NAT 1</span>
          )}
        </div>
      ))}

      {damageRolls.map((roll, i) => {
        const flagLabel = roll.flags > 1 ? DAMAGE_FLAG_LABELS[roll.flags] : null;
        return (
          <div key={i} className="flex items-baseline gap-2">
            <span className="rounded bg-[#0D1117] px-2 py-1 font-mono text-sm font-bold text-orange-300">
              {roll.total}
            </span>
            <span className="font-sans text-[11px] text-slate-500">
              {roll.damageType}
              {flagLabel && ` (${flagLabel})`}
            </span>
            {roll.dice.length > 0 && (
              <span className="font-mono text-[10px] text-slate-600">[{roll.dice.join(', ')}]</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiceRollCard({ roll }: { roll: DiceRollMessage }) {
  const time = new Date(roll.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-lg bg-[#252542] border-l-4 border-purple-500 p-3 mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-sans text-xs font-semibold text-purple-300">{roll.character}</span>
        <span className="font-sans text-[10px] text-slate-600">{time}</span>
      </div>
      <div className="font-sans text-xs text-slate-300 mb-1">{roll.title}</div>
      <RollBreakdown
        attackRolls={roll.attackRolls}
        damageRolls={roll.damageRolls}
        rollInfo={roll.rollInfo}
      />
      {roll.description && (
        <details className="mt-2">
          <summary className="cursor-pointer font-sans text-[11px] text-slate-500">
            Description
          </summary>
          <p className="mt-1 font-sans text-xs text-slate-400 leading-relaxed">
            {roll.description}
          </p>
        </details>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <Dice5 className="h-10 w-10 text-slate-600" />
      <div>
        <h3 className="font-sans text-sm font-semibold text-slate-300 mb-2">No dice rolls yet</h3>
        <p className="font-sans text-xs text-slate-500 leading-relaxed max-w-[240px]">
          Install the{' '}
          <a
            href="https://beyond20.here-for-more.info/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            Beyond 20
            <ExternalLink className="h-3 w-3" />
          </a>{' '}
          browser extension, then add this site&apos;s domain to Beyond 20&apos;s Custom Domains in
          the extension settings.
        </p>
        <p className="font-sans text-xs text-slate-600 mt-2">
          Open a character sheet on D&amp;D Beyond and click any roll button to see it appear here.
        </p>
      </div>
    </div>
  );
}

export interface DicePanelProps {
  rolls: DiceRollMessage[];
  isConnected: boolean;
  sessions: Array<{ id: string; name: string; number: number }>;
  activeSessionId: string;
  onSessionChange: (sessionId: string) => void;
  saveError: string | null;
  onDismissError: () => void;
}

export function DicePanel({
  rolls,
  isConnected,
  sessions,
  activeSessionId,
  onSessionChange,
  saveError,
  onDismissError,
}: DicePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rolls]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 40;
  }

  return (
    <div className="flex h-full flex-col bg-[#080A12] w-full">
      {/* Session selector */}
      <div className="border-b border-white/[0.07] p-3">
        <label htmlFor="dice-session-selector" className="sr-only">
          Session selector
        </label>
        <select
          id="dice-session-selector"
          value={activeSessionId}
          onChange={(e) => onSessionChange(e.target.value)}
          className="w-full rounded border border-white/[0.07] bg-[#080A12] px-3 py-2 font-sans font-semibold text-xs text-white outline-none"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              Session {s.number}: {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Connection indicator */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.07]">
        <div
          className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-slate-600'}`}
        />
        <span className="font-sans text-[10px] text-slate-500">
          {isConnected ? 'Beyond 20 connected' : 'Beyond 20 not detected'}
        </span>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="flex items-center justify-between bg-red-900/30 px-3 py-2 border-b border-red-800/30">
          <span className="font-sans text-[11px] text-red-300">{saveError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="font-sans text-[10px] text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Roll feed */}
      {rolls.length === 0 && !isConnected ? (
        <EmptyState />
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3">
          {rolls.length === 0 ? (
            <div className="flex flex-1 items-center justify-center h-full">
              <span className="font-sans text-xs text-slate-500">Waiting for dice rolls...</span>
            </div>
          ) : (
            rolls.map((roll) => <DiceRollCard key={roll.id} roll={roll} />)
          )}
        </div>
      )}
    </div>
  );
}
