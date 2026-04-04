# Optional Session on Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the session field optional when creating/editing notes, so notes can exist without being tied to a session.

**Architecture:** Change flows bottom-up: MongoDB schema → Zod validation → TypeScript interfaces → server functions → UI components. Each layer removes the `sessionId` requirement and handles the missing value gracefully.

**Tech Stack:** MongoDB/Mongoose, Zod, TypeScript, React, TanStack Start, Vitest

---

### Task 1: Make sessionId optional in Zod schemas and TypeScript interfaces

**Files:**
- Modify: `app/types/schemas/notes.ts:5,15`
- Modify: `app/types/note.ts:4,17`
- Test: `tests/server/functions/notes.test.ts`

- [ ] **Step 1: Update the Zod schemas**

In `app/types/schemas/notes.ts`, change `sessionId` from required to optional in both create and update schemas:

```typescript
// Line 5 — createNoteSchema
sessionId: z.string().trim().min(1).optional(),

// Line 15 — updateNoteSchema
sessionId: z.string().trim().min(1).optional(),
```

- [ ] **Step 2: Update the TypeScript interfaces**

In `app/types/note.ts`, make `sessionId` optional on both interfaces:

```typescript
// Line 4 in NoteData
sessionId?: string

// Line 17 in NoteListItem
sessionId?: string
```

- [ ] **Step 3: Update schema tests — sessionId now optional**

In `tests/server/functions/notes.test.ts`, update the two tests that assert sessionId is required. Replace the existing tests:

Replace the test `'rejects whitespace-only sessionId'` (lines 599-607) with:

```typescript
  it('rejects whitespace-only sessionId when provided', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      sessionId: '   ',
      title: 'Title',
      note: 'body',
    })
    expect(result.success).toBe(false)
  })

  it('accepts when sessionId is omitted', () => {
    const result = createNoteSchema.safeParse({
      campaignId: 'camp-1',
      title: 'Title',
      note: 'body',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sessionId).toBeUndefined()
    }
  })
```

Replace the test `'rejects when sessionId is missing'` (lines 619-626) — delete it entirely since sessionId is now optional.

- [ ] **Step 4: Run tests to verify schema changes pass**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass (schema tests updated, existing tests still pass since they still provide sessionId)

- [ ] **Step 5: Commit**

```bash
git add app/types/schemas/notes.ts app/types/note.ts tests/server/functions/notes.test.ts
git commit -m "feat(notes): make sessionId optional in schemas and types"
```

---

### Task 2: Make sessionId optional in MongoDB model

**Files:**
- Modify: `app/server/db/models/Note.ts:13`

- [ ] **Step 1: Update the Mongoose schema**

In `app/server/db/models/Note.ts`, change line 13 from:

```typescript
sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
```

to:

```typescript
sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: false },
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add app/server/db/models/Note.ts
git commit -m "feat(notes): make sessionId optional in MongoDB schema"
```

---

### Task 3: Update server functions to handle optional sessionId

**Files:**
- Modify: `app/server/functions/notes.ts:20-68,113-115,158`
- Test: `tests/server/functions/notes.test.ts`

- [ ] **Step 1: Write failing tests for sessionless note creation and updates**

Add these tests to `tests/server/functions/notes.test.ts`:

In the `createNote` describe block, add:

```typescript
  it('creates a note without sessionId when omitted', async () => {
    const created = makeNote({ sessionId: undefined })
    vi.mocked(Note.create).mockResolvedValue(created as never)

    const result = await _createNote({
      data: {
        campaignId: 'camp-1',
        title: 'No Session Note',
        note: 'body',
      },
    })

    expect(result.success).toBe(true)
    expect(result.note.sessionId).toBeUndefined()
    const createArg = vi.mocked(Note.create).mock.calls[0][0] as Record<string, unknown>
    expect(createArg).not.toHaveProperty('sessionId')
  })
```

In the `updateNote` describe block, add:

```typescript
  it('clears sessionId when omitted from update', async () => {
    const existing = makeNote()
    vi.mocked(Note.findById).mockResolvedValue(existing as never)

    const result = await _updateNote({
      data: {
        id: 'note-1',
        campaignId: 'camp-1',
        title: 'Updated Title',
        note: 'Updated body',
      },
    })

    expect(result.success).toBe(true)
    expect(existing.sessionId).toBeUndefined()
    expect(existing.save).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/functions/notes.test.ts -t "creates a note without sessionId"`
Expected: FAIL — sessionId is still being passed to Note.create unconditionally

Run: `npx vitest run tests/server/functions/notes.test.ts -t "clears sessionId when omitted"`
Expected: FAIL — sessionId is still set from data.sessionId (which is undefined, but it's still assigned)

- [ ] **Step 3: Update serialization functions**

In `app/server/functions/notes.ts`, update `serializeNote` (lines 20-44) and `serializeNoteListItem` (lines 46-68) to handle optional sessionId:

In `serializeNote`, change line 35 from:
```typescript
    sessionId: String(n.sessionId),
```
to:
```typescript
    sessionId: n.sessionId ? String(n.sessionId) : undefined,
```

In `serializeNoteListItem`, change line 60 from:
```typescript
    sessionId: String(n.sessionId),
```
to:
```typescript
    sessionId: n.sessionId ? String(n.sessionId) : undefined,
```

- [ ] **Step 4: Update createNote handler**

In `app/server/functions/notes.ts`, replace the `Note.create` call (lines 113-123) with:

```typescript
      const noteData: Record<string, unknown> = {
        campaignId: data.campaignId,
        createdBy: userId,
        title: data.title.trim(),
        note: data.note.trim(),
        tags: normalizeTags(data.tags ?? []),
        isPublic: data.isPublic ?? false,
        createdAt: now,
        updatedAt: now,
      }
      if (data.sessionId) {
        noteData.sessionId = data.sessionId
      }
      const doc = await Note.create(noteData)
```

- [ ] **Step 5: Update updateNote handler**

In `app/server/functions/notes.ts`, replace line 158:
```typescript
      existing.sessionId = data.sessionId
```
with:
```typescript
      existing.sessionId = data.sessionId ?? undefined
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass including new sessionless tests

- [ ] **Step 7: Commit**

```bash
git add app/server/functions/notes.ts tests/server/functions/notes.test.ts
git commit -m "feat(notes): handle optional sessionId in server functions"
```

---

### Task 4: Update NoteModal UI — add "No Session" option and remove session gate

**Files:**
- Modify: `app/components/mainview/notes/NoteModal.tsx`

- [ ] **Step 1: Update session options to include "No Session"**

In `app/components/mainview/notes/NoteModal.tsx`, replace the `sessionOptions` memo (lines 78-81) with:

```typescript
  const sessionOptions = useMemo(() => [
    { value: '', label: 'No Session' },
    ...sessions.map((s) => ({
      value: s.id,
      label: `Session ${s.number}: ${s.name}`,
    })),
  ], [sessions])
```

- [ ] **Step 2: Default sessionId to empty string**

In the reset effect (line 56), change:
```typescript
    setSessionId(noteId ? '' : defaultSessionId || sessions[0]?.id || '')
```
to:
```typescript
    setSessionId(noteId ? '' : defaultSessionId || '')
```

- [ ] **Step 3: Update populate effect for edit mode**

In the populate effect (lines 68-76), handle optional sessionId:

Change line 71 from:
```typescript
      setSessionId(fetchedNote.sessionId)
```
to:
```typescript
      setSessionId(fetchedNote.sessionId ?? '')
```

- [ ] **Step 4: Remove isSessionMissing gate and sessionId validation**

Remove the `isSessionMissing` constant (line 83):
```typescript
  const isSessionMissing = sessions.length === 0
```

In the `validate` callback (lines 85-91), remove line 88:
```typescript
    if (!sessionId) errors.sessionId = 'Session is required'
```

Also remove the `sessionId` property from the `FieldErrors` interface (lines 20-24):
```typescript
interface FieldErrors {
  title?: string
  content?: string
}
```

In `handleSubmit` (line 122), remove:
```typescript
    if (isSessionMissing) return
```

- [ ] **Step 5: Update the submit payload to omit empty sessionId**

In `handleSubmit`, replace the input construction (lines 141-148) with:

```typescript
    const input: Record<string, unknown> = {
      campaignId,
      title: title.trim(),
      note: content.trim(),
      tags: finalTags,
      isPublic,
    }
    if (sessionId) {
      input.sessionId = sessionId
    }
```

- [ ] **Step 6: Remove isSessionMissing from JSX**

Remove the amber warning block (lines 219-229).

Remove all `isSessionMissing` references from `disabled` props throughout the JSX. There are 7 occurrences — change each `disabled={isDisabled || isSessionMissing}` to `disabled={isDisabled}` and each `isSessionMissing ? 'pointer-events-none opacity-50' : ''` to just `''` (or remove the ternary entirely).

Also remove `isSessionMissing` from the submit button disabled prop (line 408):
```typescript
disabled={isDisabled}
```

Remove the sessionId field error display (lines 249-251):
```html
{fieldErrors.sessionId && (
  <p className="text-xs text-red-400 -mt-3" role="alert">{fieldErrors.sessionId}</p>
)}
```

Remove the `AlertCircle` import from line 3 (it's no longer used).

- [ ] **Step 7: Run the full test suite to verify nothing is broken**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add app/components/mainview/notes/NoteModal.tsx
git commit -m "feat(notes): add No Session option and remove session requirement from UI"
```

---

### Task 5: Update NotesFilterWidget — add "No Session" filter option

**Files:**
- Modify: `app/components/mainview/notes/NotesFilterWidget.tsx:59-64`
- Modify: `app/server/functions/notes.ts:246-250`
- Test: `tests/server/functions/notes.test.ts`

- [ ] **Step 1: Write failing test for "no session" filter on the server**

In `tests/server/functions/notes.test.ts`, in the `listNotes` describe block, add:

```typescript
  it('filters for notes with no session when sessionId is "__none__"', async () => {
    vi.mocked(Note.find).mockReturnValue({
      select: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
    } as never)

    await _listNotes({ data: { campaignId: 'camp-1', sessionId: '__none__' } })

    const filter = vi.mocked(Note.find).mock.calls[0][0] as Record<string, unknown>
    expect(filter.sessionId).toEqual({ $exists: false })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/functions/notes.test.ts -t "filters for notes with no session"`
Expected: FAIL — server currently passes `__none__` as a literal sessionId value

- [ ] **Step 3: Update server listNotes to handle "__none__" sentinel**

In `app/server/functions/notes.ts`, replace lines 248-250:

```typescript
      if (data.sessionId) {
        filter.sessionId = data.sessionId
      }
```

with:

```typescript
      if (data.sessionId === '__none__') {
        filter.sessionId = { $exists: false }
      } else if (data.sessionId) {
        filter.sessionId = data.sessionId
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass

- [ ] **Step 5: Add "No Session" option to the filter dropdown**

In `app/components/mainview/notes/NotesFilterWidget.tsx`, after the "All Sessions" option (line 59), add:

```tsx
            <option value="__none__">No Session</option>
```

So lines 59-65 become:

```tsx
            <option value="">All Sessions</option>
            <option value="__none__">No Session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                Session {session.number}: {session.name}
              </option>
            ))}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/server/functions/notes.test.ts`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add app/server/functions/notes.ts app/components/mainview/notes/NotesFilterWidget.tsx tests/server/functions/notes.test.ts
git commit -m "feat(notes): add No Session filter option for listing notes"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass with no regressions

- [ ] **Step 2: Run TypeScript type checking**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit any remaining fixes if needed**
