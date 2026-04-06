import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CatchUpWidget } from '~/components/mainview/widgets/CatchUpWidget';

const mockCatchUp = `# Session 14 — The Shattered Vault

## Where We Left Off

The party descended into the **Sunken District**.

## Party Status

| Character | HP | Conditions |
|-----------|-----|------------|
| Theron | 24/40 | Exhausted (1) |
| Mira | 31/31 | — |`;

describe('CatchUpWidget', () => {
  it('renders the CATCH UP heading', () => {
    render(<CatchUpWidget catchUp={mockCatchUp} />);
    expect(screen.getByText('CATCH UP')).toBeInTheDocument();
  });

  it('renders markdown content as HTML', async () => {
    render(<CatchUpWidget catchUp={mockCatchUp} />);
    const heading = await screen.findByRole('heading', { name: /Session 14/ });
    expect(heading).toBeInTheDocument();
  });

  it('renders GFM table from markdown', async () => {
    render(<CatchUpWidget catchUp={mockCatchUp} />);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Character' })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'HP' })).toBeInTheDocument();
  });

  it('applies col-span-full for full-width layout', () => {
    const { container } = render(<CatchUpWidget catchUp={mockCatchUp} />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section!).toHaveClass('col-span-full');
  });

  it('renders markdown content area', () => {
    render(<CatchUpWidget catchUp={mockCatchUp} />);
    const markdownDiv = screen.getByTestId('catchup-markdown');
    expect(markdownDiv).toBeInTheDocument();
    expect(markdownDiv).toHaveClass('w-full');
    expect(markdownDiv).toHaveClass('max-w-none');
    expect(markdownDiv).not.toHaveClass('max-w-3xl');
    expect(screen.getByText(/Where We Left Off/)).toBeInTheDocument();
  });

  it('renders with Open Sans heading styles in the empty state', () => {
    render(<CatchUpWidget catchUp={null} />);
    expect(screen.getByText('No catch-up content available')).toHaveClass(
      'font-sans',
      'font-semibold',
      'text-xs'
    );
  });

  it('renders FontAwesome icons and not literal Material icon names', () => {
    const { container } = render(<CatchUpWidget catchUp={mockCatchUp} />);

    // Assert that 'auto_stories' is NOT present as literal text (regression for Material Icons)
    expect(screen.queryByText('auto_stories')).not.toBeInTheDocument();

    // Assert that FontAwesome SVG icons are present
    // FontAwesomeIcon renders as an <svg> element
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });
});
