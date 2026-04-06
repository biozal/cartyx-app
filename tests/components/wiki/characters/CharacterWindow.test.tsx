import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow';
import type { CharacterData } from '~/types/character';

const baseCharacter: CharacterData = {
  id: 'char-1',
  campaignId: 'camp-1',
  createdBy: 'user-1',
  firstName: 'Thorin',
  lastName: 'Grudgebearer',
  race: 'Dwarf',
  characterClass: 'Fighter',
  age: 208,
  location: 'Stormwind',
  link: 'https://example.com/thorin',
  isPublic: true,
  canEdit: true,
  tags: ['guard', 'dwarf'],
  notes: 'A steadfast warrior.',
  gmNotes: '',
  picture: '',
  pictureCrop: null,
  sessions: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('CharacterWindow', () => {
  it('does not render the full name as a heading below the portrait', () => {
    render(<CharacterWindow character={baseCharacter} />);
    expect(screen.queryByRole('heading', { name: 'Thorin Grudgebearer' })).not.toBeInTheDocument();
  });

  it('does not render a visibility badge', () => {
    render(<CharacterWindow character={baseCharacter} />);
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
  });

  it('renders tags below the portrait', () => {
    render(<CharacterWindow character={baseCharacter} />);
    expect(screen.getByText('#guard')).toBeInTheDocument();
    expect(screen.getByText('#dwarf')).toBeInTheDocument();
  });

  it('shows the edit button when character.canEdit and onEdit are provided', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<CharacterWindow character={baseCharacter} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Edit character' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides the edit button when canEdit is false', () => {
    render(<CharacterWindow character={{ ...baseCharacter, canEdit: false }} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit character' })).not.toBeInTheDocument();
  });

  it('still renders stat blocks', () => {
    render(<CharacterWindow character={baseCharacter} />);
    expect(screen.getByText('Dwarf')).toBeInTheDocument();
    expect(screen.getByText('208')).toBeInTheDocument();
  });
});
