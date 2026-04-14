import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RaceWindow } from '~/components/wiki/races/RaceWindow';
import type { RaceData } from '~/types/race';

const baseRace: RaceData = {
  id: 'race-1',
  campaignId: 'camp-1',
  createdBy: 'user-1',
  title: 'Dwarf',
  content: '## Traits\nDarkvision, Stonecunning',
  tags: ['playable', 'core'],
  canEdit: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('RaceWindow', () => {
  it('does not render the title as a heading inside the window body', () => {
    render(<RaceWindow race={baseRace} />);
    expect(screen.queryByRole('heading', { name: 'Dwarf' })).not.toBeInTheDocument();
  });

  it('renders tags in the meta row', () => {
    render(<RaceWindow race={baseRace} />);
    expect(screen.getByText('#playable')).toBeInTheDocument();
    expect(screen.getByText('#core')).toBeInTheDocument();
  });

  it('shows the edit button when race.canEdit and onEdit are provided', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<RaceWindow race={baseRace} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Edit race' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides the edit button when race.canEdit is false', () => {
    render(<RaceWindow race={{ ...baseRace, canEdit: false }} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit race' })).not.toBeInTheDocument();
  });

  it('hides the meta row entirely when there are no tags and canEdit is false', () => {
    const { container } = render(
      <RaceWindow race={{ ...baseRace, tags: [], canEdit: false }} onEdit={vi.fn()} />
    );
    expect(container.querySelector('.border-b')).not.toBeInTheDocument();
  });
});
