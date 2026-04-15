import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalLinkItem } from '~/components/campaign/ExternalLinkItem';

describe('ExternalLinkItem', () => {
  it('renders the link name', () => {
    render(<ExternalLinkItem name="Campaign Wiki" url="https://example.com/wiki" />);
    expect(screen.getByText('Campaign Wiki')).toBeInTheDocument();
  });

  it('renders a link with correct href', () => {
    render(<ExternalLinkItem name="Campaign Wiki" url="https://example.com/wiki" />);
    const link = screen.getByRole('link', { name: /campaign wiki/i });
    expect(link).toHaveAttribute('href', 'https://example.com/wiki');
  });

  it('opens in a new tab', () => {
    render(<ExternalLinkItem name="Notes" url="https://example.com" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the link icon', () => {
    const { container } = render(<ExternalLinkItem name="Wiki" url="https://example.com" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
