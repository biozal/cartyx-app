import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleWindow } from '~/components/wiki/rules/RuleWindow';
import type { RuleData } from '~/types/rule';

const baseRule: RuleData = {
  id: 'rule-1',
  campaignId: 'camp-1',
  createdBy: 'user-1',
  title: 'Difficulty',
  content: '# Setting a DC\nVery Easy: 5',
  tags: ['rules', 'dc'],
  isPublic: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('RuleWindow', () => {
  it('does not render the title as a heading inside the window body', () => {
    render(<RuleWindow rule={baseRule} />);
    expect(screen.queryByRole('heading', { name: 'Difficulty' })).not.toBeInTheDocument();
  });

  it('renders tags in the meta row', () => {
    render(<RuleWindow rule={baseRule} />);
    expect(screen.getByText('#rules')).toBeInTheDocument();
    expect(screen.getByText('#dc')).toBeInTheDocument();
  });

  it('does not render a visibility badge', () => {
    render(<RuleWindow rule={baseRule} />);
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
  });

  it('shows the edit button when isGM and onEdit are provided', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<RuleWindow rule={baseRule} isGM onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Edit rule' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides the edit button when isGM is false', () => {
    render(<RuleWindow rule={baseRule} isGM={false} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit rule' })).not.toBeInTheDocument();
  });

  it('hides the meta row when there are no tags and no edit button', () => {
    render(<RuleWindow rule={{ ...baseRule, tags: [] }} />);
    expect(screen.queryByRole('button', { name: 'Edit rule' })).not.toBeInTheDocument();
  });
});
