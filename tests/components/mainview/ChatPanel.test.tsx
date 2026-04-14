import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '~/components/mainview/ChatPanel';
import type { ChatPanelProps } from '~/components/mainview/ChatPanel';

const defaultSessions = [
  { id: 'session-1', name: 'The Beginning', number: 1 },
  { id: 'session-14', name: 'Dark Descent', number: 14 },
];

const defaultProps: ChatPanelProps = {
  messages: [],
  onSendMessage: vi.fn(),
  sessions: defaultSessions,
  activeSessionId: 'session-14',
  onSessionChange: vi.fn(),
  saveError: null,
  onDismissError: vi.fn(),
};

describe('ChatPanel', () => {
  it('renders session selector', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole('combobox', { name: 'Session selector' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Session 14: Dark Descent' })).toBeInTheDocument();
  });

  it('renders General and GM tabs', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'GM' })).toBeInTheDocument();
  });

  it('marks General tab active by default', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking GM tab makes it active', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...defaultProps} />);

    await user.click(screen.getByRole('tab', { name: 'GM' }));

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders "No messages yet" placeholder in active panel when empty', () => {
    render(<ChatPanel {...defaultProps} />);

    const visiblePanel = screen.getByRole('tabpanel');
    expect(visiblePanel).toHaveTextContent('No messages yet');
  });

  it('renders message input and send button', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
  });

  it('ArrowRight moves focus from General to GM tab', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...defaultProps} />);

    const generalTab = screen.getByRole('tab', { name: 'General' });
    generalTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowLeft wraps from General to GM tab', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...defaultProps} />);

    const generalTab = screen.getByRole('tab', { name: 'General' });
    generalTab.focus();
    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('tab', { name: 'GM' })).toHaveAttribute('aria-selected', 'true');
  });

  it('single tabpanel is in the DOM and reflects active channel', () => {
    render(<ChatPanel {...defaultProps} />);

    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(1);
  });

  it('tabpanel content changes when switching tabs', async () => {
    const user = userEvent.setup();
    const gmMessages = [
      {
        id: 'gm-1',
        seq: 1,
        text: 'GM only message',
        channel: 'gm' as const,
        type: 'chat' as const,
        authorId: 'u1',
        authorName: 'GM',
        sessionId: 'session-14',
        campaignId: 'campaign-1',
        timestamp: Date.now(),
      },
    ];
    render(<ChatPanel {...defaultProps} messages={gmMessages} />);

    // General tab is active, GM message not visible
    expect(screen.getByRole('tabpanel')).toHaveTextContent('No messages yet');

    // Switch to GM tab
    await user.click(screen.getByRole('tab', { name: 'GM' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('GM only message');
  });
});
