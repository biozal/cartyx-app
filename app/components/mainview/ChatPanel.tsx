import React, { useId, useRef, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';

type ChannelTab = 'general' | 'gm';

const SESSIONS = [8, 9, 10, 11, 12, 13, 14];

const CHANNELS: { id: ChannelTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'gm', label: 'GM' },
];

export function ChatPanel() {
  const [activeChannel, setActiveChannel] = useState<ChannelTab>('general');
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabsId = useId();

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = CHANNELS.findIndex((channel) => channel.id === activeChannel);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % CHANNELS.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + CHANNELS.length) % CHANNELS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = CHANNELS.length - 1;
    } else {
      return;
    }

    setActiveChannel(CHANNELS[nextIndex]!.id);
    const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <div className="flex h-full flex-col bg-[#080A12] w-full">
      <div className="border-b border-white/[0.07] p-3">
        <label htmlFor="chat-session-selector" className="sr-only">
          Session selector
        </label>
        <select
          id="chat-session-selector"
          defaultValue="Session 14"
          className="w-full rounded border border-white/[0.07] bg-[#080A12] px-3 py-2 font-sans font-semibold text-xs text-white outline-none"
        >
          {SESSIONS.map((session) => (
            <option key={session} value={`Session ${session}`}>
              Session {session}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between border-b border-white/[0.07] px-3">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Chat channels"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-1"
        >
          {CHANNELS.map((channel) => {
            const isActive = channel.id === activeChannel;
            return (
              <button
                key={channel.id}
                id={`${tabsId}-${channel.id}-tab`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tabsId}-${channel.id}-panel`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveChannel(channel.id)}
                className={`h-11 border-b-2 px-3 font-sans font-semibold text-xs transition-colors ${
                  isActive
                    ? 'border-[#2563EB] text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {channel.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Add channel"
          className="text-slate-400 transition-colors hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {CHANNELS.map((channel) => (
        <div
          key={channel.id}
          id={`${tabsId}-${channel.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${channel.id}-tab`}
          hidden={channel.id !== activeChannel}
          className="flex flex-1 items-center justify-center overflow-y-auto p-4 w-full"
        >
          <span className="font-sans font-semibold text-xs text-slate-500">Coming Soon</span>
        </div>
      ))}

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Message..."
            aria-label="Message input"
            className="flex-1 rounded border border-white/[0.07] bg-[#0D1117] px-3 py-2 font-sans font-semibold text-xs text-white outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            aria-label="Send message"
            className="text-[#2563EB] transition-colors hover:text-white"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
