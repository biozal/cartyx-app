# Storybook Guide

This project uses Storybook to preview UI components in isolation, generate autodocs, and run interaction tests for stories.

## Getting Started

Install dependencies and start the local Storybook server:

```bash
npm ci
npm run storybook
```

Storybook runs on `http://localhost:6006`.

## Available Scripts

| Script | Purpose |
| --- | --- |
| `npm run storybook` | Start Storybook locally on port `6006` |
| `npm run build-storybook` | Build the static Storybook site into `storybook-static/` |
| `npm run test:storybook` | Run Storybook interaction tests with Vitest and Playwright |

## Project Structure

Storybook is configured specifically for component stories under `app/components/`.

```text
.storybook/
├── main.ts             # Story discovery, addons, Vite aliases for mocks
├── preview.ts          # Global decorators, React Query provider, backgrounds
└── mocks/
    ├── router.tsx      # Mock for @tanstack/react-router Link
    └── useAuth.ts      # Mock for ~/hooks/useAuth

app/
└── components/
    ├── ComponentName.tsx
    ├── ComponentName.stories.tsx
    ├── campaign/
    │   └── *.stories.tsx
    └── mainview/
        └── *.stories.tsx
```

Storybook only loads stories matching:

```ts
../app/components/**/*.stories.@(ts|tsx)
```

Keep stories next to their components so discovery stays automatic.

## Writing Stories

Create stories next to the component file using the `ComponentName.stories.tsx` convention.

Base pattern used in this repo:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ComponentName } from './ComponentName'

const meta: Meta<typeof ComponentName> = {
  title: 'Components/ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}
```

Current story conventions in this project:

- Use `Meta` and `StoryObj` from `@storybook/react-vite`.
- Add `tags: ['autodocs']` so Storybook generates docs pages automatically.
- Use `args` for simple prop variations.
- Use `render` when the component needs local state, composition, or a custom layout.
- Use `parameters.layout = 'fullscreen'` for full-screen views like `Topbar`, `MainView`, and `WikiPanel`.
- Add local `decorators` when a story needs a specific container width, background, or framing.

Examples in this repo:

- [`app/components/FormInput.stories.tsx`](/private/tmp/issue-79/app/components/FormInput.stories.tsx)
- [`app/components/Topbar.stories.tsx`](/private/tmp/issue-79/app/components/Topbar.stories.tsx)
- [`app/components/mainview/Widget.stories.tsx`](/private/tmp/issue-79/app/components/mainview/Widget.stories.tsx)

## Interaction Tests with `play`

This repo already uses Storybook interaction tests. The pattern is:

```tsx
import { expect, within, userEvent, fn } from 'storybook/test'

export const Clickable: Story = {
  args: {
    onClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    expect(args.onClick).toHaveBeenCalledOnce()
  },
}
```

Reference stories:

- [`app/components/PixelButton.stories.tsx`](/private/tmp/issue-79/app/components/PixelButton.stories.tsx)
- [`app/components/Toast.stories.tsx`](/private/tmp/issue-79/app/components/Toast.stories.tsx)
- [`app/components/mainview/WikiPanel.stories.tsx`](/private/tmp/issue-79/app/components/mainview/WikiPanel.stories.tsx)

Run them with:

```bash
npm run test:storybook
```

That Vitest project is configured in [`vitest.config.ts`](/private/tmp/issue-79/vitest.config.ts) through `@storybook/addon-vitest` and Playwright Chromium.

## Mocking Dependencies

This project already mocks a few app dependencies for Storybook in [`.storybook/main.ts`](/private/tmp/issue-79/.storybook/main.ts):

- `@tanstack/react-router` is aliased to [`.storybook/mocks/router.tsx`](/private/tmp/issue-79/.storybook/mocks/router.tsx)
- `~/hooks/useAuth` is aliased to [`.storybook/mocks/useAuth.ts`](/private/tmp/issue-79/.storybook/mocks/useAuth.ts)

Use those existing mocks when a component depends on routing or auth state.

Global preview setup in [`.storybook/preview.ts`](/private/tmp/issue-79/.storybook/preview.ts) also provides:

- `QueryClientProvider` for components using React Query
- shared dark background framing
- default Storybook background options for dark and light surfaces

If you add a component that depends on another app-level provider or hook, prefer extending `.storybook/mocks/` or `preview.ts` instead of duplicating setup inside each story.

## Building Static Storybook

Build the deployable Storybook site with:

```bash
npm run build-storybook
```

The generated files are written to `storybook-static/`.

This is the directory deployed by the GitHub Pages workflow.

## Tips

### Autodocs

- Keep `tags: ['autodocs']` on each story meta export.
- Prefer clean, typed props so generated controls and docs stay readable.
- Provide meaningful `args` defaults for the primary story so docs show a useful baseline state.

### `argTypes`

Use `argTypes` when Storybook cannot infer useful controls or when you want stricter control over the docs UI.

Examples in this repo:

- [`app/components/PixelButton.stories.tsx`](/private/tmp/issue-79/app/components/PixelButton.stories.tsx)
- [`app/components/campaign/CampaignHeroBanner.stories.tsx`](/private/tmp/issue-79/app/components/campaign/CampaignHeroBanner.stories.tsx)

Typical cases:

- enum-like props using `control: 'select'`
- text fields that should stay editable in Controls
- union-heavy component APIs where the raw inferred types are noisy

### Dark Theme

The shared preview already uses a dark Cartyx surface:

- background wrapper: `#080A12`
- default Storybook background: `cartyx-dark`

If your component is designed for a full-screen or panel context, keep that dark framing and add a story-level decorator or `layout: 'fullscreen'` when needed. If you need to verify contrast on light surfaces, switch the Storybook background to `white` from the toolbar.
