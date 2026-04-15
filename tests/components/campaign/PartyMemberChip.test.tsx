import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartyMemberChip } from '~/components/campaign/PartyMemberChip';

describe('PartyMemberChip', () => {
  it('renders characterName and characterClass', () => {
    render(<PartyMemberChip characterName="Thalion" characterClass="Ranger" avatar={null} />);
    expect(screen.getByText('Thalion')).toBeInTheDocument();
    expect(screen.getByText('Ranger')).toBeInTheDocument();
  });

  it('renders avatar image when provided', () => {
    render(
      <PartyMemberChip
        characterName="Lyra"
        characterClass="Wizard"
        avatar="https://example.com/avatar.jpg"
      />
    );
    const img = screen.getByRole('img', { name: 'Lyra' });
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders placeholder icon when no avatar', () => {
    const { container } = render(
      <PartyMemberChip characterName="Grax" characterClass="Barbarian" avatar={null} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
