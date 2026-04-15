import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockShowToast = vi.fn();
vi.mock('~/components/Toast', () => ({
  showToast: (msg: string) => mockShowToast(msg),
  Toast: () => null,
}));

import { InviteCodeField } from '~/components/campaign/InviteCodeField';

describe('InviteCodeField', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the invite code in a readonly input', () => {
    render(<InviteCodeField code="ABCD-EFGH" />);
    const input = screen.getByRole('textbox', { name: /invite code/i });
    expect(input).toHaveValue('ABCD-EFGH');
    expect(input).toHaveAttribute('readonly');
  });

  it('shows INVITE CODE label', () => {
    render(<InviteCodeField code="ABCD-EFGH" />);
    expect(screen.getByText('INVITE CODE')).toBeInTheDocument();
  });

  it('copies to clipboard and shows toast on button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<InviteCodeField code="ABCD-EFGH" />);
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
    // wait for the promise to resolve
    await Promise.resolve();
    expect(mockShowToast).toHaveBeenCalledWith('Invite code copied: ABCD-EFGH');
  });

  it('falls back to toast with code when clipboard fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<InviteCodeField code="FAIL-CODE" />);
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    await Promise.resolve();
    await Promise.resolve(); // rejection propagates one extra tick
    expect(mockShowToast).toHaveBeenCalledWith('Code: FAIL-CODE');
  });
});
