import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WikiPanel } from '~/components/wiki/WikiPanel';

// Mock panels since they require routing/campaign context
vi.mock('~/components/wiki/characters/CharactersPanel', () => ({
  CharactersPanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="characters-panel">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('~/components/wiki/races/RacesPanel', () => ({
  RacesPanel: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="races-panel">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

describe('WikiPanel', () => {
  it('renders the Characters category button', () => {
    render(<WikiPanel />);

    expect(screen.getByRole('button', { name: 'Characters' })).toBeInTheDocument();
  });

  it('renders the Races category button', () => {
    render(<WikiPanel />);

    expect(screen.getByRole('button', { name: 'Races' })).toBeInTheDocument();
  });

  it('shows exactly two category buttons', () => {
    render(<WikiPanel />);

    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('clicking Characters shows CharactersPanel', async () => {
    const user = userEvent.setup();
    render(<WikiPanel />);

    await user.click(screen.getByRole('button', { name: 'Characters' }));

    expect(screen.getByTestId('characters-panel')).toBeInTheDocument();
  });

  it('CharactersPanel onBack returns to category list', async () => {
    const user = userEvent.setup();
    render(<WikiPanel />);

    await user.click(screen.getByRole('button', { name: 'Characters' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByTestId('characters-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Characters' })).toBeInTheDocument();
  });

  it('clicking Races shows RacesPanel', async () => {
    const user = userEvent.setup();
    render(<WikiPanel />);

    await user.click(screen.getByRole('button', { name: 'Races' }));

    expect(screen.getByTestId('races-panel')).toBeInTheDocument();
  });

  it('RacesPanel onBack returns to category list', async () => {
    const user = userEvent.setup();
    render(<WikiPanel />);

    await user.click(screen.getByRole('button', { name: 'Races' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByTestId('races-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Races' })).toBeInTheDocument();
  });
});
