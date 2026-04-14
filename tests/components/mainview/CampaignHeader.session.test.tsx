import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('~/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => {
    const href = params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to)
      : to;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

import { CampaignHeader } from '~/components/mainview/CampaignHeader';
import { useAuth } from '~/hooks/useAuth';

const mockUser = {
  id: 'g_1',
  provider: 'google' as const,
  name: 'Alice',
  email: 'alice@example.com',
  avatar: null,
  role: 'gm' as const,
};

function defaultAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  });
}

describe('CampaignHeader — Active Session Display', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultAuth();
  });

  it('shows active session name and gear icon when isGM=true and activeSessionName provided', () => {
    render(
      <CampaignHeader
        campaignId="camp-1"
        isGM={true}
        activeSessionName="The Lost Temple"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('active-session-name')).toHaveTextContent('The Lost Temple');
    expect(screen.getByRole('link', { name: 'Manage sessions' })).toBeInTheDocument();
  });

  it('shows "No Session" when isGM=true but no activeSessionName', () => {
    render(
      <CampaignHeader campaignId="camp-1" isGM={true} activeTab="dashboard" onTabChange={vi.fn()} />
    );
    expect(screen.getByTestId('active-session-name')).toHaveTextContent('No Session');
    expect(screen.getByRole('link', { name: 'Manage sessions' })).toBeInTheDocument();
  });

  it('does not show session info or gear icon for non-GMs', () => {
    render(
      <CampaignHeader
        campaignId="camp-1"
        isGM={false}
        activeSessionName="The Lost Temple"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('active-session-name')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage sessions' })).not.toBeInTheDocument();
  });

  it('does not show session info when campaignId is not provided', () => {
    render(
      <CampaignHeader
        isGM={true}
        activeSessionName="The Lost Temple"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('active-session-name')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage sessions' })).not.toBeInTheDocument();
  });

  it('gear icon links to /campaigns/$campaignId/sessions', () => {
    render(
      <CampaignHeader
        campaignId="camp-42"
        isGM={true}
        activeSessionName="Session Zero"
        activeTab="dashboard"
        onTabChange={vi.fn()}
      />
    );
    const link = screen.getByRole('link', { name: 'Manage sessions' });
    expect(link).toHaveAttribute('href', '/campaigns/camp-42/sessions');
  });
});
