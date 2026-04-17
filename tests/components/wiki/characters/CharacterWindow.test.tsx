import React, { type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow';
import type { CharacterData } from '~/types/character';

function Wrapper({ children }: { children: ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function customRender(ui: React.ReactNode, options?: Parameters<typeof render>[1]) {
  return render(ui, { wrapper: Wrapper, ...options });
}

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
  status: { value: 'alive', changedAt: null, changedBy: null },
  relationships: [],
};

describe('CharacterWindow', () => {
  it('does not render the full name as a heading below the portrait', () => {
    customRender(<CharacterWindow character={baseCharacter} />);
    expect(screen.queryByRole('heading', { name: 'Thorin Grudgebearer' })).not.toBeInTheDocument();
  });

  it('does not render a visibility badge', () => {
    customRender(<CharacterWindow character={baseCharacter} />);
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
  });

  it('renders tags below the portrait', () => {
    customRender(<CharacterWindow character={baseCharacter} />);
    expect(screen.getByText('#guard')).toBeInTheDocument();
    expect(screen.getByText('#dwarf')).toBeInTheDocument();
  });

  it('shows the edit button when character.canEdit and onEdit are provided', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    customRender(<CharacterWindow character={baseCharacter} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Edit character' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides the edit button when canEdit is false', () => {
    customRender(
      <CharacterWindow character={{ ...baseCharacter, canEdit: false }} onEdit={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Edit character' })).not.toBeInTheDocument();
  });

  it('still renders stat blocks', () => {
    customRender(<CharacterWindow character={baseCharacter} />);
    expect(screen.getByText('Dwarf')).toBeInTheDocument();
    expect(screen.getByText('208')).toBeInTheDocument();
  });

  it('hides the meta row entirely when there are no tags and canEdit is false', () => {
    customRender(
      <CharacterWindow
        character={{ ...baseCharacter, tags: [], canEdit: false }}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Edit character' })).not.toBeInTheDocument();
    expect(screen.queryByText(/#/)).not.toBeInTheDocument();
  });

  describe('tabs', () => {
    it('renders General tab content by default with notes', () => {
      customRender(<CharacterWindow character={baseCharacter} />);
      expect(screen.getByText('A steadfast warrior.')).toBeInTheDocument();
    });

    it('shows GM Notes tab when canEdit is true', () => {
      customRender(<CharacterWindow character={baseCharacter} />);
      expect(screen.getByText('GM Notes')).toBeInTheDocument();
    });

    it('hides GM Notes tab when canEdit is false', () => {
      customRender(<CharacterWindow character={{ ...baseCharacter, canEdit: false }} />);
      expect(screen.queryByText('GM Notes')).not.toBeInTheDocument();
    });

    it('switches to GM Notes tab on click', async () => {
      const user = userEvent.setup();
      customRender(
        <CharacterWindow character={{ ...baseCharacter, gmNotes: 'Secret villain plans.' }} />
      );
      await user.click(screen.getByText('GM Notes'));
      expect(screen.getByText('Secret villain plans.')).toBeInTheDocument();
    });

    it('switches to Relationships tab showing placeholder', async () => {
      const user = userEvent.setup();
      customRender(<CharacterWindow character={baseCharacter} />);
      await user.click(screen.getByText('Relationships'));
      expect(screen.getByText('No relationships yet.')).toBeInTheDocument();
    });

    it('shows Deceased label when status is deceased', () => {
      customRender(
        <CharacterWindow
          character={{
            ...baseCharacter,
            status: { value: 'deceased', changedAt: '2026-03-01', changedBy: 'user-1' },
          }}
        />
      );
      expect(screen.getByText('Deceased')).toBeInTheDocument();
    });

    it('does not show Deceased label when status is alive', () => {
      customRender(<CharacterWindow character={baseCharacter} />);
      expect(screen.queryByText('Deceased')).not.toBeInTheDocument();
    });
  });
});
