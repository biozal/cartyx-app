# UI Space Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate titles, consolidate visibility badges and tags into compact rows, and move Globe/Lock/ExternalLink icons into title bars across Rules, Races, Characters, and Notes windows and modals.

**Architecture:** Add `isPublic` and `link` to the backend's `HydratedDocument` hydration response; add `titleIcon`/`titleSuffix` props to `FloatingWindow` and thread them through `FloatingWindowManager` → `GMScreensView`; refactor all three Window content components to accept `onEdit` and render a single compact meta row; update view modals to show actual titles and icons in their headers.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Vitest + React Testing Library, Mongoose (backend)

---

## File Map

| File                                                           | Change                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `app/types/gmscreen.ts`                                        | Add `isPublic?`, `link?` to `HydratedDocument`                      |
| `app/server/functions/gmscreens.ts`                            | Update `CollectionFetcher`, character/rule fetchers, `hydrateRefs`  |
| `tests/server/functions/gmscreens.test.ts`                     | Add hydration tests for character and rule `isPublic`/`link`        |
| `app/components/mainview/FloatingWindow.tsx`                   | Add `titleIcon?`, `titleSuffix?` props                              |
| `app/components/mainview/FloatingWindowManager.tsx`            | Add same fields to `ManagedWindow`, thread to `FloatingWindow`      |
| `tests/components/mainview/FloatingWindow.test.tsx`            | Add tests for `titleIcon` and `titleSuffix` rendering               |
| `app/components/mainview/gmscreens/GMScreensView.tsx`          | Build icons from hydrated data, set on `ManagedWindow`              |
| `app/components/wiki/rules/RuleWindow.tsx`                     | Remove title/badge, add compact meta row, add `onEdit`/`isGM` props |
| `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`      | Pass `onEdit`/`isGM` to `RuleWindow`, remove absolute edit button   |
| `app/components/wiki/races/RaceWindow.tsx`                     | Remove title, add compact meta row, add `onEdit` prop               |
| `app/components/wiki/races/RaceWindowWrapper.tsx`              | Pass `onEdit` to `RaceWindow`, remove absolute edit button          |
| `app/components/wiki/characters/CharacterWindow.tsx`           | Remove name/badge/link, move tags below portrait, add `onEdit`      |
| `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx` | Pass `onEdit` to `CharacterWindow`, remove absolute edit button     |
| `app/components/wiki/rules/RuleViewModal.tsx`                  | Show `rule.title` + Globe/Lock icon in header                       |
| `app/components/wiki/races/RaceViewModal.tsx`                  | Show `race.title` in header                                         |
| `app/components/wiki/characters/CharacterViewModal.tsx`        | Show character name + Globe/Lock + ExternalLink in header           |
| `app/components/mainview/notes/NoteModal.tsx`                  | Show live Globe/Lock icon in header                                 |
| `tests/components/mainview/notes/NoteModal.test.tsx`           | Add visibility icon tests                                           |

---

## Task 1: Backend — Extend HydratedDocument with isPublic and link

**Files:**

- Modify: `app/types/gmscreen.ts`
- Modify: `app/server/functions/gmscreens.ts`
- Test: `tests/server/functions/gmscreens.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test block near the end of the `getGMScreen` describe block in `tests/server/functions/gmscreens.test.ts` (after the existing tests around line 1025):

```typescript
it('includes isPublic and link in hydrated character and isPublic in hydrated rule', async () => {
  const screenDoc = {
    _id: 'screen-x',
    campaignId: 'camp-1',
    name: 'Test',
    tabOrder: 0,
    createdBy: 'dbuser-1',
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    windows: [
      {
        _id: 'win-c',
        collection: 'character',
        documentId: 'char-1',
        state: 'open',
        x: 0,
        y: 0,
        width: 300,
        height: 400,
        zIndex: 1,
      },
      {
        _id: 'win-r',
        collection: 'rule',
        documentId: 'rule-1',
        state: 'open',
        x: 320,
        y: 0,
        width: 300,
        height: 400,
        zIndex: 2,
      },
    ],
    stacks: [],
  };

  vi.mocked(GMScreen.findOne).mockReturnValue({
    lean: vi.fn().mockResolvedValue(screenDoc),
  } as never);

  vi.mocked(Character.find).mockReturnValue({
    lean: vi.fn().mockResolvedValue([
      {
        _id: 'char-1',
        firstName: 'Thorin',
        lastName: 'Grudgebearer',
        notes: 'A dwarf warrior.',
        isPublic: true,
        link: 'https://example.com/thorin',
      },
    ]),
  } as never);

  vi.mocked(Rule.find).mockReturnValue({
    lean: vi.fn().mockResolvedValue([
      {
        _id: 'rule-1',
        title: 'Difficulty',
        content: 'Setting a DC',
        isPublic: false,
      },
    ]),
  } as never);

  const result = await _getGMScreen({ data: { id: 'screen-x', campaignId: 'camp-1' } });

  expect(result.hydrated['character:char-1']).toEqual({
    id: 'char-1',
    collection: 'character',
    title: 'Thorin Grudgebearer',
    content: 'A dwarf warrior.',
    isPublic: true,
    link: 'https://example.com/thorin',
  });

  expect(result.hydrated['rule:rule-1']).toEqual({
    id: 'rule-1',
    collection: 'rule',
    title: 'Difficulty',
    content: 'Setting a DC',
    isPublic: false,
  });

  expect(Character.find).toHaveBeenCalledWith(
    { _id: { $in: ['char-1'] }, campaignId: 'camp-1' },
    '_id firstName lastName notes isPublic link'
  );

  expect(Rule.find).toHaveBeenCalledWith(
    { _id: { $in: ['rule-1'] }, campaignId: 'camp-1' },
    '_id title content isPublic'
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run --project unit tests/server/functions/gmscreens.test.ts -t "includes isPublic and link"
```

Expected: FAIL — the hydrated objects won't have `isPublic` or `link` yet.

- [ ] **Step 3: Update `HydratedDocument` type in `app/types/gmscreen.ts`**

Replace the `HydratedDocument` interface:

```typescript
export interface HydratedDocument {
  id: string;
  collection: string;
  title: string;
  content: string;
  isPublic?: boolean;
  link?: string;
}
```

- [ ] **Step 4: Update `CollectionFetcher` interface in `app/server/functions/gmscreens.ts`**

At line 119, replace the `CollectionFetcher` interface:

```typescript
interface CollectionFetcher {
  fetch(
    ids: string[],
    campaignId: string
  ): Promise<
    Array<{ _id: unknown; title?: string; content?: string; isPublic?: boolean; link?: string }>
  >;
}
```

- [ ] **Step 5: Update the character fetcher in `COLLECTION_REGISTRY`**

Replace the `character` entry (starting at line 140):

```typescript
character: {
  async fetch(ids: string[], campaignId: string) {
    return Character.find({ _id: { $in: ids }, campaignId }, '_id firstName lastName notes isPublic link')
      .lean()
      .then((docs) =>
        docs.map((d) => {
          const ch = d as {
            _id: unknown;
            firstName?: string;
            lastName?: string;
            notes?: string;
            isPublic?: boolean;
            link?: string;
          };
          return {
            _id: ch._id,
            title: `${ch.firstName ?? ''} ${ch.lastName ?? ''}`.trim(),
            content: ch.notes,
            isPublic: ch.isPublic,
            link: ch.link,
          };
        })
      ) as Promise<Array<{ _id: unknown; title?: string; content?: string; isPublic?: boolean; link?: string }>>;
  },
},
```

- [ ] **Step 6: Update the rule fetcher in `COLLECTION_REGISTRY`**

Replace the `rule` entry (starting at line 169):

```typescript
rule: {
  async fetch(ids: string[], campaignId: string) {
    return Rule.find({ _id: { $in: ids }, campaignId }, '_id title content isPublic')
      .lean()
      .then((docs) =>
        docs.map((d) => ({
          _id: d._id,
          title: (d as { title?: string }).title,
          content: (d as { content?: string }).content,
          isPublic: (d as { isPublic?: boolean }).isPublic,
        }))
      ) as Promise<Array<{ _id: unknown; title?: string; content?: string; isPublic?: boolean; link?: string }>>;
  },
},
```

- [ ] **Step 7: Update the `hydrateRefs` loop to include the new fields**

In `hydrateRefs` (around line 214), replace the assignment inside the loop:

```typescript
hydrated[`${collectionName}:${id}`] = {
  id,
  collection: collectionName,
  title: doc.title ?? '',
  content: doc.content ?? '',
  ...(doc.isPublic !== undefined && { isPublic: doc.isPublic }),
  ...(doc.link && { link: doc.link }),
};
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
npx vitest run --project unit tests/server/functions/gmscreens.test.ts -t "includes isPublic and link"
```

Expected: PASS

- [ ] **Step 9: Run the full gmscreens test suite to confirm no regressions**

```bash
npx vitest run --project unit tests/server/functions/gmscreens.test.ts
```

Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add app/types/gmscreen.ts app/server/functions/gmscreens.ts tests/server/functions/gmscreens.test.ts
git commit -m "feat: include isPublic and link in hydrated GM screen window data"
```

---

## Task 2: FloatingWindow — Add titleIcon and titleSuffix props

**Files:**

- Modify: `app/components/mainview/FloatingWindow.tsx`
- Test: `tests/components/mainview/FloatingWindow.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two tests to `tests/components/mainview/FloatingWindow.test.tsx` inside the existing `describe('FloatingWindow', ...)` block:

```typescript
it('renders titleIcon before the title text', () => {
  render(
    <div className="relative h-[600px] w-[800px]">
      <FloatingWindow
        id="rule"
        title="Difficulty"
        titleIcon={<span data-testid="lock-icon">🔒</span>}
      >
        <div>content</div>
      </FloatingWindow>
    </div>,
  )

  expect(screen.getByTestId('lock-icon')).toBeInTheDocument()
})

it('renders titleSuffix after the title text', () => {
  render(
    <div className="relative h-[600px] w-[800px]">
      <FloatingWindow
        id="char"
        title="Thorin Grudgebearer"
        titleSuffix={<span data-testid="ext-link">🔗</span>}
      >
        <div>content</div>
      </FloatingWindow>
    </div>,
  )

  expect(screen.getByTestId('ext-link')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --project unit tests/components/mainview/FloatingWindow.test.tsx -t "renders titleIcon|renders titleSuffix"
```

Expected: FAIL — props don't exist yet.

- [ ] **Step 3: Add the new props to `FloatingWindowProps` in `app/components/mainview/FloatingWindow.tsx`**

In the `FloatingWindowProps` interface (around line 24), add after `className?`:

```typescript
titleIcon?: ReactNode
titleSuffix?: ReactNode
```

Also update the function signature to destructure them:

```typescript
export function FloatingWindow({
  id,
  title,
  children,
  initialPosition = DEFAULT_POSITION,
  initialSize = DEFAULT_SIZE,
  initialState = 'normal',
  zIndex = 1,
  onClose,
  onFocus,
  onStateChange,
  onLayoutChange,
  className = '',
  titleIcon,
  titleSuffix,
}: FloatingWindowProps) {
```

- [ ] **Step 4: Update the title bar element to render the new props**

Find the title div around line 335 and replace it:

```tsx
<div
  id={titleId}
  className="flex items-center gap-1.5 min-w-0 font-sans font-semibold text-xs text-slate-300"
>
  {titleIcon && <span className="shrink-0 flex items-center">{titleIcon}</span>}
  <span className="truncate">{title}</span>
  {titleSuffix && <span className="shrink-0 flex items-center">{titleSuffix}</span>}
</div>
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --project unit tests/components/mainview/FloatingWindow.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/mainview/FloatingWindow.tsx tests/components/mainview/FloatingWindow.test.tsx
git commit -m "feat: add titleIcon and titleSuffix props to FloatingWindow"
```

---

## Task 3: FloatingWindowManager — Thread titleIcon and titleSuffix

**Files:**

- Modify: `app/components/mainview/FloatingWindowManager.tsx`
- Test: `tests/components/mainview/FloatingWindowManager.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/components/mainview/FloatingWindowManager.test.tsx` inside the existing describe block:

```typescript
it('passes titleIcon to the FloatingWindow', () => {
  const windows: ManagedWindow[] = [
    {
      id: 'rule-1',
      title: 'Difficulty',
      titleIcon: <span data-testid="rule-icon">icon</span>,
      content: <div>Rule content</div>,
      position: { x: 10, y: 10 },
      size: { width: 300, height: 200 },
      state: 'normal',
      zIndex: 1,
    },
  ]

  render(
    <div className="relative h-[600px] w-[800px]">
      <FloatingWindowManager windows={windows} onWindowsChange={vi.fn()} />
    </div>,
  )

  expect(screen.getByTestId('rule-icon')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run --project unit tests/components/mainview/FloatingWindowManager.test.tsx -t "passes titleIcon"
```

Expected: FAIL — `ManagedWindow` doesn't have `titleIcon` yet.

- [ ] **Step 3: Add `titleIcon` and `titleSuffix` to `ManagedWindow` in `app/components/mainview/FloatingWindowManager.tsx`**

In the `ManagedWindow` interface (around line 11), add after `contentKey?`:

```typescript
titleIcon?: ReactNode
titleSuffix?: ReactNode
```

Make sure `ReactNode` is imported — add it to the existing import:

```typescript
import type { ReactNode } from 'react';
```

- [ ] **Step 4: Pass the new props through to `FloatingWindow` in the render**

In the `activeWindows.map(...)` block (around line 96), update the `<FloatingWindow>` usage:

```tsx
<FloatingWindow
  key={window.id}
  id={window.id}
  title={window.title}
  titleIcon={window.titleIcon}
  titleSuffix={window.titleSuffix}
  className={window.className}
  initialPosition={window.position}
  initialSize={window.size}
  initialState={window.state}
  zIndex={window.zIndex}
  onFocus={() => handleFocus(window.id)}
  onClose={() => handleClose(window.id)}
  onStateChange={(state) => handleStateChange(window.id, state)}
  onLayoutChange={(layout) => handleLayoutChange(window.id, layout)}
>
  {window.content}
</FloatingWindow>
```

- [ ] **Step 5: Run all FloatingWindowManager tests**

```bash
npx vitest run --project unit tests/components/mainview/FloatingWindowManager.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/mainview/FloatingWindowManager.tsx tests/components/mainview/FloatingWindowManager.test.tsx
git commit -m "feat: thread titleIcon and titleSuffix through FloatingWindowManager"
```

---

## Task 4: GMScreensView — Build icons from hydrated data

**Files:**

- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx`

No new tests for this task — the icons are built from data already tested in Task 1, and the rendering is covered by Task 2.

- [ ] **Step 1: Add Globe, Lock, ExternalLink to the lucide-react import**

At the top of `app/components/mainview/gmscreens/GMScreensView.tsx`, update the lucide import. Currently it imports `{ Plus, Layers, Loader2, AlertTriangle }`. Add to it:

```typescript
import { Plus, Layers, Loader2, AlertTriangle, Globe, Lock, ExternalLink } from 'lucide-react';
```

- [ ] **Step 2: Build `titleIcon` and `titleSuffix` when constructing each `ManagedWindow`**

In the `setLocalWindows` callback (inside the `useEffect` that merges server data), locate where each window is mapped. The `doc` and `key` variables are already computed at the top of the loop. Add icon construction after `markdownContent` is set (around line 393):

```typescript
const doc = activeScreen.hydrated[key];
const title = doc?.title || key;
const markdownContent = doc?.content || '';

let titleIcon: React.ReactNode;
let titleSuffix: React.ReactNode;

if (w.collection === 'rule' || w.collection === 'character') {
  if (doc?.isPublic === true) {
    titleIcon = <Globe className="h-3 w-3 text-emerald-400" />;
  } else if (doc?.isPublic === false) {
    titleIcon = <Lock className="h-3 w-3 text-amber-400" />;
  }
}

if (w.collection === 'character' && doc?.link) {
  titleSuffix = (
    <a
      href={doc.link}
      target="_blank"
      rel="noopener noreferrer"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center"
      aria-label="External link"
    >
      <ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-400 transition-colors" />
    </a>
  );
}
```

- [ ] **Step 3: Pass `titleIcon` and `titleSuffix` in the new-window object**

In the `return` statement that builds a new `ManagedWindow` (around line 446):

```typescript
return {
  id: w.id,
  title,
  titleIcon,
  titleSuffix,
  contentKey: markdownContent,
  position: w.x != null && w.y != null ? { x: w.x, y: w.y } : undefined,
  size: w.width != null && w.height != null ? { width: w.width, height: w.height } : undefined,
  state: toFloatingState(w.state),
  zIndex: w.zIndex,
  className: flashWindowId === w.id ? 'animate-flash-border' : '',
  content: windowContent,
};
```

- [ ] **Step 4: Pass `titleIcon` and `titleSuffix` in the existing-window merge**

In the `return` statement that merges an existing window (around line 434):

```typescript
return {
  ...existing,
  title,
  titleIcon,
  titleSuffix,
  contentKey: markdownContent,
  className: flashWindowId === existing.id ? 'animate-flash-border' : '',
  content: windowContent,
};
```

- [ ] **Step 5: Update the staleness check to include `titleIcon` and `titleSuffix`**

The staleness comparison around line 460 currently checks `p.title`, `p.contentKey`, and `p.className`. `titleIcon` and `titleSuffix` are ReactNodes and can't be equality-compared reliably — they will re-create on each render from server data. The check can simply be removed for these fields (they're already excluded); confirm the existing check doesn't reference them and leave it as-is. The current check is:

```typescript
prev.every(
  (p, i) =>
    p.id === merged[i]!.id &&
    p.title === merged[i]!.title &&
    p.contentKey === merged[i]!.contentKey &&
    p.className === merged[i]!.className
);
```

This is fine — `titleIcon`/`titleSuffix` aren't compared, so they update whenever the server data updates. No change needed here.

- [ ] **Step 6: Run typecheck to confirm no type errors**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add app/components/mainview/gmscreens/GMScreensView.tsx
git commit -m "feat: add visibility and external link icons to FloatingWindow title bars"
```

---

## Task 5: RuleWindow + RuleWindowWrapper — Compact meta row

**Files:**

- Modify: `app/components/wiki/rules/RuleWindow.tsx`
- Modify: `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`

- [ ] **Step 1: Write a failing test**

Create `tests/components/wiki/rules/RuleWindow.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleWindow } from '~/components/wiki/rules/RuleWindow';
import type { RuleData } from '~/types/rule';

const baseRule: RuleData = {
  id: 'rule-1',
  campaignId: 'camp-1',
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --project unit tests/components/wiki/rules/RuleWindow.test.tsx
```

Expected: multiple FAIL — the current `RuleWindow` still renders the title heading and visibility badge.

- [ ] **Step 3: Rewrite `app/components/wiki/rules/RuleWindow.tsx`**

```typescript
import { Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleData } from '~/types/rule';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RuleWindowProps {
  rule: RuleData;
  isGM?: boolean;
  onEdit?: () => void;
}

export function RuleWindow({ rule, isGM, onEdit }: RuleWindowProps) {
  const showMeta = rule.tags.length > 0 || (isGM && !!onEdit);

  return (
    <div className="flex flex-col h-full">
      {showMeta && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05] shrink-0">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {rule.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
          {isGM && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
              aria-label="Edit rule"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        <div className={MARKDOWN_PROSE_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`**

Replace the `RuleWindowWrapper` function:

```typescript
import { RuleWindow } from '~/components/wiki/rules/RuleWindow';
import { RuleModal } from '~/components/wiki/rules/RuleModal';
import { useRule } from '~/hooks/useRules';

export function EditRuleModalWrapper({
  campaignId,
  ruleId,
  onClose,
}: {
  campaignId: string;
  ruleId: string;
  onClose: () => void;
}) {
  return <RuleModal isOpen onClose={onClose} campaignId={campaignId} ruleId={ruleId} />;
}

export function RuleWindowWrapper({
  ruleId,
  campaignId,
  isGM,
  onEdit,
}: {
  ruleId: string;
  campaignId: string;
  isGM: boolean;
  onEdit: () => void;
}) {
  const { rule, isLoading } = useRule(ruleId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading rule...</p>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Rule not found</p>
      </div>
    );
  }

  return <RuleWindow rule={rule} isGM={isGM} onEdit={onEdit} />;
}
```

Note: the `Pencil` import is no longer needed in the wrapper — remove it.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --project unit tests/components/wiki/rules/RuleWindow.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/components/wiki/rules/RuleWindow.tsx app/components/mainview/gmscreens/RuleWindowWrapper.tsx tests/components/wiki/rules/RuleWindow.test.tsx
git commit -m "feat: compact meta row for RuleWindow, move edit button inside component"
```

---

## Task 6: RaceWindow + RaceWindowWrapper — Compact meta row

**Files:**

- Modify: `app/components/wiki/races/RaceWindow.tsx`
- Modify: `app/components/wiki/races/RaceWindowWrapper.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/wiki/races/RaceWindow.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RaceWindow } from '~/components/wiki/races/RaceWindow';
import type { RaceData } from '~/types/race';

const baseRace: RaceData = {
  id: 'race-1',
  campaignId: 'camp-1',
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --project unit tests/components/wiki/races/RaceWindow.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Rewrite `app/components/wiki/races/RaceWindow.tsx`**

```typescript
import { Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RaceData } from '~/types/race';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RaceWindowProps {
  race: RaceData;
  onEdit?: () => void;
}

export function RaceWindow({ race, onEdit }: RaceWindowProps) {
  const showMeta = race.tags.length > 0 || (race.canEdit && !!onEdit);

  return (
    <div className="flex flex-col h-full">
      {showMeta && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05] shrink-0">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {race.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
          {race.canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
              aria-label="Edit race"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className={MARKDOWN_PROSE_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{race.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `app/components/wiki/races/RaceWindowWrapper.tsx`**

```typescript
import { RaceWindow } from './RaceWindow';
import { RaceModal } from './RaceModal';
import { useRace } from '~/hooks/useRaces';

export function EditRaceModalWrapper({
  campaignId,
  raceId,
  onClose,
}: {
  campaignId: string;
  raceId: string;
  onClose: () => void;
}) {
  return (
    <RaceModal
      isOpen
      onClose={onClose}
      campaignId={campaignId}
      raceId={raceId}
    />
  );
}

export function RaceWindowWrapper({
  raceId,
  campaignId,
  onEdit,
}: {
  raceId: string;
  campaignId: string;
  onEdit: () => void;
}) {
  const { race, isLoading } = useRace(raceId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading race...</p>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Race not found</p>
      </div>
    );
  }

  return <RaceWindow race={race} onEdit={onEdit} />;
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run --project unit tests/components/wiki/races/RaceWindow.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/components/wiki/races/RaceWindow.tsx app/components/wiki/races/RaceWindowWrapper.tsx tests/components/wiki/races/RaceWindow.test.tsx
git commit -m "feat: compact meta row for RaceWindow, move edit button inside component"
```

---

## Task 7: CharacterWindow + CharacterWindowWrapper — Restructure

**Files:**

- Modify: `app/components/wiki/characters/CharacterWindow.tsx`
- Modify: `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/wiki/characters/CharacterWindow.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow';
import type { CharacterData } from '~/types/character';

const baseCharacter: CharacterData = {
  id: 'char-1',
  campaignId: 'camp-1',
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
  gmNotes: null,
  picture: null,
  pictureCrop: null,
  sessionIntroducedId: null,
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --project unit tests/components/wiki/characters/CharacterWindow.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Rewrite `app/components/wiki/characters/CharacterWindow.tsx`**

```typescript
import React, { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CharacterData, PictureCrop } from '~/types/character';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

function getCropStyle(crop: PictureCrop): React.CSSProperties {
  const centerX = (crop.x + crop.width / 2) * 100;
  const centerY = (crop.y + crop.height / 2) * 100;
  const scale = 1 / crop.width;
  return {
    objectPosition: `${centerX}% ${centerY}%`,
    transform: `scale(${scale})`,
  };
}

interface CharacterWindowProps {
  character: CharacterData;
  onEdit?: () => void;
}

const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
  ['#14b8a6', '#3b82f6'],
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0).toUpperCase();
  const l = lastName.charAt(0).toUpperCase();
  return l ? `${f}${l}` : f;
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] border border-white/[0.06] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className="text-xs text-slate-300 font-medium truncate">{value}</p>
    </div>
  );
}

function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/[0.06] rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.03] transition-colors"
      >
        {title}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function CharacterWindow({ character, onEdit }: CharacterWindowProps) {
  const fullName = `${character.firstName} ${character.lastName}`.trim();
  const initials = getInitials(character.firstName, character.lastName);
  const gradientIndex = hashName(fullName) % GRADIENT_PAIRS.length;
  const [gradFrom, gradTo] = GRADIENT_PAIRS[gradientIndex]!;

  const stats: { label: string; value: string }[] = [];
  if (character.race) stats.push({ label: 'Race', value: character.race });
  if (character.characterClass) stats.push({ label: 'Class', value: character.characterClass });
  if (character.age != null) stats.push({ label: 'Age', value: String(character.age) });
  if (character.location) stats.push({ label: 'Location', value: character.location });

  const showMeta = character.tags.length > 0 || (character.canEdit && !!onEdit);

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
      {/* Portrait */}
      <div className="flex justify-center">
        <div
          className="w-24 h-24 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
          style={
            character.picture
              ? undefined
              : { background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }
          }
        >
          {character.picture ? (
            <img
              src={character.picture}
              alt={fullName}
              className="w-full h-full object-cover"
              style={character.pictureCrop ? getCropStyle(character.pictureCrop) : undefined}
            />
          ) : (
            <span className="text-2xl text-white font-semibold">{initials}</span>
          )}
        </div>
      </div>

      {/* Tags + edit button below portrait */}
      {showMeta && (
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {character.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
            >
              #{tag}
            </span>
          ))}
          {character.canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
              aria-label="Edit character"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Stats grid */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <StatBlock key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Details accordion */}
      {character.notes && (
        <Accordion title="Details" defaultOpen>
          <div className={MARKDOWN_PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.notes}</ReactMarkdown>
          </div>
        </Accordion>
      )}

      {/* GM Notes accordion */}
      {character.gmNotes && (
        <Accordion title="GM Notes">
          <div className={MARKDOWN_PROSE_CLASSES}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{character.gmNotes}</ReactMarkdown>
          </div>
        </Accordion>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx`**

```typescript
import React from 'react';
import { CharacterWindow } from '~/components/wiki/characters/CharacterWindow';
import { CharacterModal } from '~/components/wiki/characters/CharacterModal';
import { useCharacter } from '~/hooks/useCharacters';
import { useCampaign } from '~/hooks/useCampaigns';

export function EditCharacterModalWrapper({
  campaignId,
  characterId,
  onClose,
}: {
  campaignId: string;
  characterId: string;
  onClose: () => void;
}) {
  const { campaign } = useCampaign(campaignId);
  const sessions = campaign?.sessions ?? [];
  return (
    <CharacterModal
      isOpen
      onClose={onClose}
      campaignId={campaignId}
      characterId={characterId}
      sessions={sessions}
    />
  );
}

export function CharacterWindowWrapper({
  characterId,
  campaignId,
  onEdit,
}: {
  characterId: string;
  campaignId: string;
  onEdit: () => void;
}) {
  const { character, isLoading } = useCharacter(characterId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Character not found</p>
      </div>
    );
  }

  return <CharacterWindow character={character} onEdit={onEdit} />;
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run --project unit tests/components/wiki/characters/CharacterWindow.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/components/wiki/characters/CharacterWindow.tsx app/components/mainview/gmscreens/CharacterWindowWrapper.tsx tests/components/wiki/characters/CharacterWindow.test.tsx
git commit -m "feat: restructure CharacterWindow — remove name/badge, move tags below portrait"
```

---

## Task 8: RuleViewModal — Show actual title and icon in header

**Files:**

- Modify: `app/components/wiki/rules/RuleViewModal.tsx`

No new test file — the modal's header changes are visual; the data fetching is covered by `useRule` hook tests.

- [ ] **Step 1: Update `app/components/wiki/rules/RuleViewModal.tsx`**

Add `Globe` and `Lock` to the imports:

```typescript
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Lock, X } from 'lucide-react';
import { RuleWindow } from './RuleWindow';
import { useRule } from '~/hooks/useRules';
```

Replace the `<header>` element:

```tsx
<header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
  <div className="flex items-center gap-2 min-w-0">
    {rule &&
      (rule.isPublic ? (
        <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      ) : (
        <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      ))}
    <h2
      id="rule-view-modal-title"
      className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest truncate"
    >
      {rule?.title ?? 'Rule'}
    </h2>
  </div>
  <button
    type="button"
    onClick={onClose}
    className="text-slate-500 hover:text-white transition-colors shrink-0"
    aria-label="Close modal"
  >
    <X className="h-5 w-5" />
  </button>
</header>
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/rules/RuleViewModal.tsx
git commit -m "feat: show actual rule title and visibility icon in RuleViewModal header"
```

---

## Task 9: RaceViewModal — Show actual title in header

**Files:**

- Modify: `app/components/wiki/races/RaceViewModal.tsx`

- [ ] **Step 1: Update `app/components/wiki/races/RaceViewModal.tsx`**

No icon needed for races (no visibility concept). Replace the `<header>` element:

```tsx
<header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
  <h2
    id="race-view-modal-title"
    className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest truncate"
  >
    {race?.title ?? 'Race'}
  </h2>
  <button
    type="button"
    onClick={onClose}
    className="text-slate-500 hover:text-white transition-colors"
    aria-label="Close modal"
  >
    <X className="h-5 w-5" />
  </button>
</header>
```

`race` comes from `const { race, isLoading } = useRace(raceId, campaignId)` already in scope. No import changes needed.

- [ ] **Step 2: Run typecheck and full test suite**

```bash
npm run typecheck && npm test
```

Expected: no errors, all tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/races/RaceViewModal.tsx
git commit -m "feat: show actual race title in RaceViewModal header"
```

---

## Task 10: CharacterViewModal — Show actual title and icons in header

**Files:**

- Modify: `app/components/wiki/characters/CharacterViewModal.tsx`

- [ ] **Step 1: Update `app/components/wiki/characters/CharacterViewModal.tsx`**

Add `Globe`, `Lock`, `ExternalLink` to the imports:

```typescript
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Globe, Lock, X } from 'lucide-react';
import { CharacterWindow } from './CharacterWindow';
import { useCharacter } from '~/hooks/useCharacters';
```

Replace the `<header>` element:

```tsx
<header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
  <div className="flex items-center gap-2 min-w-0">
    {character &&
      (character.isPublic ? (
        <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      ) : (
        <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      ))}
    <h2
      id="character-view-modal-title"
      className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest truncate"
    >
      {character ? `${character.firstName} ${character.lastName}`.trim() : 'Character'}
    </h2>
    {character?.link && (
      <a
        href={character.link}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
        aria-label="External link"
      >
        <ExternalLink className="h-3.5 w-3.5 text-slate-500 hover:text-blue-400 transition-colors" />
      </a>
    )}
  </div>
  <button
    type="button"
    onClick={onClose}
    className="text-slate-500 hover:text-white transition-colors shrink-0"
    aria-label="Close modal"
  >
    <X className="h-5 w-5" />
  </button>
</header>
```

- [ ] **Step 2: Run typecheck and full test suite**

```bash
npm run typecheck && npm test
```

Expected: no errors, all tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/characters/CharacterViewModal.tsx
git commit -m "feat: show character name, visibility icon, and external link in CharacterViewModal header"
```

---

## Task 11: NoteModal — Live visibility icon in header

**Files:**

- Modify: `app/components/mainview/notes/NoteModal.tsx`
- Test: `tests/components/mainview/notes/NoteModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Add these tests inside the existing `describe` block in `tests/components/mainview/notes/NoteModal.test.tsx`. Place them after the existing tests:

```typescript
describe('header visibility icon', () => {
  beforeEach(() => {
    vi.mocked(useCreateNote).mockReturnValue({ create: vi.fn(), isLoading: false } as never);
    vi.mocked(useUpdateNote).mockReturnValue({ update: vi.fn(), isLoading: false } as never);
    vi.mocked(useDeleteNote).mockReturnValue({ remove: vi.fn(), isLoading: false } as never);
    vi.mocked(useNote).mockReturnValue({ note: null, isLoading: false } as never);
  });

  it('shows a Lock icon by default when creating a note', () => {
    render(
      <NoteModal
        isOpen
        onClose={vi.fn()}
        campaignId="camp-1"
        sessions={[]}
      />,
    );
    expect(screen.getByLabelText('Private')).toBeInTheDocument();
  });

  it('shows a Globe icon after the user toggles to Public', async () => {
    const user = userEvent.setup();
    render(
      <NoteModal
        isOpen
        onClose={vi.fn()}
        campaignId="camp-1"
        sessions={[]}
      />,
    );
    await user.click(screen.getByText('Public'));
    expect(screen.getByLabelText('Public')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --project unit tests/components/mainview/notes/NoteModal.test.tsx -t "header visibility icon"
```

Expected: FAIL

- [ ] **Step 3: Update `app/components/mainview/notes/NoteModal.tsx`**

`Globe` and `Lock` are already imported at line 3. Update the `<header>` element:

```tsx
<header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
  <div className="flex items-center gap-2">
    {isPublic ? (
      <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-label="Public" />
    ) : (
      <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-label="Private" />
    )}
    <h2
      id="note-modal-title"
      className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
    >
      {noteId ? 'Edit Note' : 'Create Note'}
    </h2>
  </div>
  <button
    type="button"
    onClick={onClose}
    className="text-slate-500 hover:text-white transition-colors"
    aria-label="Close modal"
  >
    <X className="h-5 w-5" />
  </button>
</header>
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run --project unit tests/components/mainview/notes/NoteModal.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/mainview/notes/NoteModal.tsx tests/components/mainview/notes/NoteModal.test.tsx
git commit -m "feat: add live visibility icon to NoteModal header"
```
