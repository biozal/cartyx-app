import React, { useId, useRef, useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import type { ChatMessage } from '~/hooks/useChatMessages';

type ChannelTab = 'general' | 'gm';

const CHANNELS: { id: ChannelTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'gm', label: 'GM' },
];

function SpellCard({ message }: { message: ChatMessage }) {
  const data = message.beyond20Data;
  if (!data) return null;

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="font-sans text-xs font-semibold text-purple-300">
          {message.authorName}
        </span>
        <span className="rounded bg-blue-900/50 px-1.5 py-0.5 font-sans text-[9px] text-blue-300">
          D&amp;D Beyond
        </span>
        <span className="font-sans text-[10px] text-slate-600">{time}</span>
      </div>
      <div className="rounded-lg bg-[#252542] border-l-4 border-orange-500 p-3">
        <div className="font-sans text-sm font-bold text-yellow-300 mb-1">{data.title}</div>
        <div className="font-sans text-[11px] text-slate-400 mb-2">{data.source}</div>
        {Object.keys(data.properties).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {Object.entries(data.properties).map(([key, value]) => (
              <div key={key} className="font-sans text-[11px]">
                <span className="text-slate-500">{key}:</span>{' '}
                <span className="text-slate-300">{value}</span>
              </div>
            ))}
          </div>
        )}
        {data.description && (
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer font-sans text-[11px] text-slate-500 mb-1">
              Description
            </summary>
            <p className="leading-relaxed">{data.description}</p>
          </details>
        )}
      </div>
    </div>
  );
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-1.5 mb-0.5">
        <span className="font-sans text-xs font-semibold text-purple-300">
          {message.authorName}
        </span>
        <span className="font-sans text-[10px] text-slate-600">{time}</span>
      </div>
      <div className="font-sans text-xs text-slate-300">{message.text}</div>
    </div>
  );
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, channel: 'general' | 'gm') => void;
  sessions: Array<{ id: string; name: string; number: number }>;
  activeSessionId: string;
  onSessionChange: (sessionId: string) => void;
  saveError: string | null;
  onDismissError: () => void;
}

export function ChatPanel({
  messages,
  onSendMessage,
  sessions,
  activeSessionId,
  onSessionChange,
  saveError,
  onDismissError,
}: ChatPanelProps) {
  const [activeChannel, setActiveChannel] = useState<ChannelTab>('general');
  const [inputText, setInputText] = useState('');
  const tablistRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const tabsId = useId();

  useEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeChannel]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 40;
  }

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text, activeChannel);
    setInputText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = CHANNELS.findIndex((c) => c.id === activeChannel);
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
      {/* Session selector */}
      <div className="border-b border-white/[0.07] p-3">
        <label htmlFor="chat-session-selector" className="sr-only">
          Session selector
        </label>
        <select
          id="chat-session-selector"
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

      {/* Channel tabs */}
      <div className="flex items-center border-b border-white/[0.07] px-3">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Chat channels"
          tabIndex={0}
          onKeyDown={handleTabKeyDown}
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

      {/* Message feed — one tabpanel per channel for correct ARIA */}
      {CHANNELS.map((channel) => {
        const channelMessages = messages.filter((m) => m.channel === channel.id);
        return (
          <div
            key={channel.id}
            ref={channel.id === activeChannel ? scrollRef : undefined}
            onScroll={channel.id === activeChannel ? handleScroll : undefined}
            id={`${tabsId}-${channel.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${channel.id}-tab`}
            hidden={activeChannel !== channel.id}
            className="flex-1 overflow-y-auto p-3"
          >
            {channelMessages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center h-full">
                <span className="font-sans text-xs text-slate-500">No messages yet</span>
              </div>
            ) : (
              channelMessages.map((msg) =>
                msg.type === 'chat' ? (
                  <ChatMessageBubble key={msg.id} message={msg} />
                ) : (
                  <SpellCard key={msg.id} message={msg} />
                )
              )
            )}
          </div>
        );
      })}

      {/* Message input */}
      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Message..."
            aria-label="Message input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-white/[0.07] bg-[#0D1117] px-3 py-2 font-sans font-semibold text-xs text-white outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={handleSend}
            className="text-[#2563EB] transition-colors hover:text-white"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
