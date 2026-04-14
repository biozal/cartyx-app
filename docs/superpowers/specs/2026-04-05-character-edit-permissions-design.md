# Character Edit Permissions — Design Spec

## Problem

Characters can currently be edited by anyone who can view them. Public characters should only mean _viewable_ by anyone — editing should be restricted to the character's creator or the Game Master. When a player who didn't create the character clicks on it, it opens in edit mode (the full form modal) instead of read-only view.

## Solution

Add a server-computed `canEdit` boolean to character responses. Use it on the client to decide whether clicking a character opens the edit modal or a read-only view.

## Server Changes

### Permission fixes (`app/server/functions/characters.ts`)

**`updateCharacter` (line 231):** Change permission check from creator-only to creator-or-GM:

```
// Before
if (String(existing.createdBy) !== userId) throw new Error('Forbidden');
// After
if (String(existing.createdBy) !== userId && !member.isGM) throw new Error('Forbidden');
```

**`deleteCharacter` (line 289):** Same fix — allow GMs to delete characters.

### `canEdit` flag

**`getCharacter`:** After serialization, compute and attach `canEdit`:

```typescript
const canEdit = String(doc.createdBy) === userId || member.isGM;
return { ...serialized, canEdit };
```

**`listCharacters`:** Compute `canEdit` per character in the `.map()` using `userId` and `member.isGM`.

Serializer functions (`serializeCharacter`, `serializeCharacterListItem`) stay unchanged — `canEdit` is merged at the call site.

## Type Changes

### `app/types/character.ts`

Add `canEdit: boolean` to both `CharacterData` and `CharacterListItem` interfaces.

## UI Changes

### `app/components/wiki/characters/CharactersPanel.tsx`

When a character is clicked:

- If `character.canEdit` → open `CharacterModal` (edit form, existing behavior)
- If `!character.canEdit` → open `CharacterWindow` inside a read-only modal overlay

The read-only modal uses the same dark overlay/centered panel pattern as `CharacterModal` but renders `CharacterWindow` inside it with only a close button (no save/delete footer).

### `app/components/mainview/gmscreens/CharacterWindowWrapper.tsx`

The edit (pencil) button should only render when the character has `canEdit: true`. Since this component already fetches the character via `useCharacter`, the `canEdit` flag will be available on the response.

## Unchanged

- `CharacterModal` — only opened when `canEdit` is true, no changes needed
- `CharacterWindow` — already a read-only component, no changes needed
- `CharacterCard` — just fires `onClick`, the panel decides what to open
- GM Notes visibility — already stripped server-side for non-GMs
- Character creation flow — any campaign member can still create
- Visibility/public/private filtering logic — unchanged
