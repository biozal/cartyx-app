import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepWizard } from '~/components/StepWizard';

const steps = ['THE QUEST', 'THE SCHEDULE', 'THE GATHERING', 'THE ROSTER', 'REVIEW'];

describe('StepWizard', () => {
  it('renders a button for each step', () => {
    render(<StepWizard steps={steps} currentStep={1} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(steps.length);
  });

  it('renders step labels', () => {
    render(<StepWizard steps={steps} currentStep={1} />);
    expect(screen.getAllByText('THE').length).toBeGreaterThan(0);
    expect(screen.getByText('QUEST')).toBeInTheDocument();
  });

  it('calls onStepClick with the correct step number when clicked', () => {
    const onStepClick = vi.fn();
    render(<StepWizard steps={steps} currentStep={1} onStepClick={onStepClick} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]!); // step 3
    expect(onStepClick).toHaveBeenCalledWith(3);
  });

  it('does not throw when onStepClick is not provided', () => {
    render(<StepWizard steps={steps} currentStep={1} />);
    const buttons = screen.getAllByRole('button');
    expect(() => fireEvent.click(buttons[0]!)).not.toThrow();
  });

  it('applies active styles to the current step button', () => {
    render(<StepWizard steps={steps} currentStep={2} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]!.className).toMatch(/from-blue-700/);
  });

  it('applies completed styles to steps before current', () => {
    render(<StepWizard steps={steps} currentStep={3} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]!.className).toMatch(/blue-600/);
    expect(buttons[1]!.className).toMatch(/blue-600/);
  });
});
