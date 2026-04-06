# Character Edit Permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict character editing to the creator and GM; show read-only view for everyone else.

**Architecture:** Add a server-computed `canEdit` boolean to character API responses. Fix server permission checks to allow GM editing. On the client, use `canEdit` to choose between the edit modal and a read-only modal.

**Tech Stack:** TypeScript, TanStack Start (server functions), React, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-character-edit-permissions-design.md`

---

## File Map

| Action | File                                                           | Responsibility                                    |
| ------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Modify | `app/types/character.ts`                                       | Add `canEdit` to interfaces                       |
| Modify | `app/server/functions/characters.ts`                           | Fix permission checks, add `canEdit` to responses |
| Modify | `app/components/wiki/characters/CharactersPanel.tsx`           | Route clicks to edit modal or read-only modal     |
| Create | `app/components/wiki/characters/CharacterViewModal.tsx`        | Read-only modal wrapper around `CharacterWindow`  |
| Modify | `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx` | Conditionally show edit button                    |
| Modify | `app/hooks/useCharacters.ts`                                   | Update type casts to include `canEdit`            |

---

### Task 1: Add `canEdit` to type interfaces

**Files:**

- Modify: `app/types/character.ts`

- [ ] **Step 1: Add `canEdit` to `CharacterData`**

In `app/types/character.ts`, add `canEdit: boolean` after the `updatedAt` field in the `CharacterData` interface:

```typescript
  updatedAt: string
  canEdit: boolean
}
```

- [ ] **Step 2: Add `canEdit` to `CharacterListItem`**

Same file, add `canEdit: boolean` after `updatedAt` in `CharacterListItem`:

```typescript
  updatedAt: string
  canEdit: boolean
}
```

- [ ] **Step 3: Run typecheck to confirm the type change propagates**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Type errors in `characters.ts` server functions where `canEdit` is now missing from the return values. This confirms the types are wired up correctly. We'll fix these in Task 2.

- [ ] **Step 4: Commit**

```bash
git add app/types/character.ts
git commit -m "feat: add canEdit boolean to character type interfaces"
```

---

### Task 2: Fix server permission checks and add `canEdit` to responses

**Files:**

- Modify: `app/server/functions/characters.ts`

- [ ] **Step 1: Fix `updateCharacter` permission check**

In `app/server/functions/characters.ts`, find line 231:

```typescript
// OLD
if (String(existing.createdBy) !== userId) throw new Error('Forbidden');
```

Replace with:

```typescript
// NEW — creator or GM can edit
const { isGM } = member;
if (String(existing.createdBy) !== userId && !isGM) throw new Error('Forbidden');
```

Note: `member` is already destructured from `requireCampaignMember` at line 224. We need to destructure `isGM` from it.

- [ ] **Step 2: Fix `deleteCharacter` permission check**

Same file, find line 289:

```typescript
// OLD
if (String(existing.createdBy) !== userId) throw new Error('Forbidden');
```

Replace with:

```typescript
// NEW — creator or GM can delete
if (String(existing.createdBy) !== userId && !member.isGM) throw new Error('Forbidden');
```

- [ ] **Step 3: Add `canEdit` to `getCharacter` response**

In the `getCharacter` function, find the section around line 444-451 where it returns the serialized character. Replace:

```typescript
const serialized = serializeCharacter(doc);

// Strip gmNotes for non-GMs
if (!member.isGM) {
  serialized.gmNotes = '';
}

return serialized;
```

With:

```typescript
const serialized = serializeCharacter(doc);

// Strip gmNotes for non-GMs
if (!member.isGM) {
  serialized.gmNotes = '';
}

const canEdit = String(doc.createdBy) === userId || member.isGM;
return { ...serialized, canEdit };
```

- [ ] **Step 4: Add `canEdit` to `listCharacters` response**

In the `listCharacters` function, find the `.map(serializeCharacterListItem)` call around line 410. Replace:

```typescript
).map(serializeCharacterListItem);
```

With:

```typescript
).map((doc) => ({
  ...serializeCharacterListItem(doc),
  canEdit: String(doc.createdBy) === userId || member.isGM,
}));
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: No type errors (or only unrelated pre-existing ones). The server now satisfies the `canEdit` field requirement.

- [ ] **Step 6: Commit**

```bash
git add app/server/functions/characters.ts
git commit -m "feat: fix character permissions — allow GM edit/delete, add canEdit flag"
```

---

### Task 3: Create read-only character view modal

**Files:**

- Create: `app/components/wiki/characters/CharacterViewModal.tsx`

- [ ] **Step 1: Create `CharacterViewModal` component**

Create `app/components/wiki/characters/CharacterViewModal.tsx`:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CharacterWindow } from './CharacterWindow';
import { useCharacter } from '~/hooks/useCharacters';

interface CharacterViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: string;
  campaignId: string;
}

export function CharacterViewModal({
  isOpen,
  onClose,
  characterId,
  campaignId,
}: CharacterViewModalProps) {
  const { character, isLoading } = useCharacter(characterId, campaignId);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-view-modal-title"
        className="w-full max-w-lg max-h-[90vh] bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="character-view-modal-title"
            className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
          >
            Character
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

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-slate-500 animate-pulse">Loading character...</p>
            </div>
          ) : character ? (
            <CharacterWindow character={character} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-slate-500">Character not found</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/characters/CharacterViewModal.tsx
git commit -m "feat: add read-only CharacterViewModal component"
```

---

### Task 4: Update `CharactersPanel` to route clicks by `canEdit`

**Files:**

- Modify: `app/components/wiki/characters/CharactersPanel.tsx`

- [ ] **Step 1: Add state and import for read-only modal**

In `CharactersPanel.tsx`, add the import for `CharacterViewModal`:

```typescript
import { CharacterViewModal } from './CharacterViewModal';
```

Add a new state variable for the read-only view alongside the existing `selectedCharacterId` state:

```typescript
const [viewCharacterId, setViewCharacterId] = useState<string | undefined>();
```

- [ ] **Step 2: Update `handleCharacterClick` to check `canEdit`**

Replace the existing `handleCharacterClick`:

```typescript
const handleCharacterClick = (character: CharacterListItem) => {
  setSelectedCharacterId(character.id);
  setIsModalOpen(true);
};
```

With:

```typescript
const handleCharacterClick = (character: CharacterListItem) => {
  if (character.canEdit) {
    setSelectedCharacterId(character.id);
    setIsModalOpen(true);
  } else {
    setViewCharacterId(character.id);
  }
};
```

- [ ] **Step 3: Add close handler for view modal**

Add after `handleModalClose`:

```typescript
const handleViewModalClose = () => {
  setViewCharacterId(undefined);
};
```

- [ ] **Step 4: Render `CharacterViewModal`**

After the existing `<CharacterModal ... />` at the bottom of the JSX, add:

```tsx
{
  viewCharacterId && (
    <CharacterViewModal
      isOpen={!!viewCharacterId}
      onClose={handleViewModalClose}
      characterId={viewCharacterId}
      campaignId={campaignId}
    />
  );
}
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/components/wiki/characters/CharactersPanel.tsx
git commit -m "feat: open read-only view for non-editable characters in wiki panel"
```

---

### Task 5: Conditionally show edit button in GM screen wrapper

**Files:**

- Modify: `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx`

- [ ] **Step 1: Conditionally render the edit button**

In `CharacterWindowWrapper.tsx`, the edit (pencil) button is rendered unconditionally at line 59-66. Wrap it with a `canEdit` check. The `character` object from `useCharacter` now includes `canEdit`.

Replace:

```tsx
return (
  <div className="relative h-full">
    <button
      type="button"
      onClick={onEdit}
      className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
      aria-label="Edit character"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
    <CharacterWindow character={character} />
  </div>
);
```

With:

```tsx
return (
  <div className="relative h-full">
    {character.canEdit && (
      <button
        type="button"
        onClick={onEdit}
        className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
        aria-label="Edit character"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    )}
    <CharacterWindow character={character} />
  </div>
);
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/mainview/gmscreens/CharacterWindowWrapper.tsx
git commit -m "feat: hide edit button on GM screen when user cannot edit character"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npx tsc --noEmit`

Expected: Clean pass (or only pre-existing unrelated errors).

- [ ] **Step 2: Run lint**

Run: `npx eslint app/types/character.ts app/server/functions/characters.ts app/components/wiki/characters/CharactersPanel.tsx app/components/wiki/characters/CharacterViewModal.tsx app/components/mainview/gmscreens/CharacterWindowWrapper.tsx`

Expected: No errors.

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: All existing tests pass.

- [ ] **Step 4: Manual smoke test checklist**

If a dev environment is available, verify:

- As **character creator**: clicking your own character opens the edit modal
- As **GM**: clicking any character opens the edit modal; GM screen edit button visible
- As **other player**: clicking a public character opens the read-only `CharacterViewModal`; GM screen edit button hidden (if character is on a shared screen)
- Server rejects update/delete from a non-creator, non-GM user (403 Forbidden)

# Final Check

Review all the code after it's changed to validate all code changes follow Typescript, React, and Tanstack best practices and that it doesn't introduct regression or PR comements about the code quality.
