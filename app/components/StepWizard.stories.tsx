import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { StepWizard } from './StepWizard'

const STEPS = ['THE QUEST', 'THE SCHEDULE', 'THE GATHERING', 'THE ROSTER', 'REVIEW']

const meta: Meta<typeof StepWizard> = {
  title: 'UI/StepWizard',
  component: StepWizard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-lg p-6 bg-[#080A12]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof meta>

export const Step1Of5: Story = {
  args: {
    steps: STEPS,
    currentStep: 1,
  },
}

export const Step3Of5: Story = {
  args: {
    steps: STEPS,
    currentStep: 3,
  },
}

export const AllComplete: Story = {
  args: {
    steps: STEPS,
    currentStep: 5,
  },
}
