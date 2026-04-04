# Drag Notes to GM Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow notes to be dragged from the Inspector Notes panel and dropped onto the GM Screen, creating a positioned floating window with duplicate detection and visual feedback.

**Architecture:** Native HTML Drag and Drop API on the client. A small server-side extension adds optional `x`/`y` to the `openWindow` schema so the drop position is persisted in a single round trip. The server already handles duplicate detection (`existed: true`), so the client just needs to trigger a flash animation for that case.

**Tech Stack:** React, Native HTML DnD API, Zod schemas, Mongoose, TanStack Query mutations, Tailwind CSS

---

### Task 1: Extend `openWindow` schema and server function to accept optional coordinates

**Files:**
- Modify: `app/types/schemas/gmscreens.ts:48-57`
- Modify: `app/server/functions/gmscreens.ts:679-688`
- Modify: `app/hooks/useGMScreens.ts:210-215`

- [ ] **Step 1: Add optional x/y to the openWindow Zod schema**

In `app/types/schemas/gmscreens.ts`, update `openWindowSchema`:

```typescript
export const openWindowSchema = z.object({
  screenId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  collection: z.enum(SUPPORTED_COLLECTIONS, {
    errorMap: () => ({
      message: `Unsupported collection. Must be one of: ${SUPPORTED_COLLECTIONS.join(', ')}`,
    }),
  }),
  documentId: z.string().trim().min(1),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
})
```

- [ ] **Step 2: Use the new x/y in the server's openWindow handler**

In `app/server/functions/gmscreens.ts`, update the `newWindow` object (around line 679):

```typescript
const newWindow = {
  collection: data.collection,
  documentId: data.documentId,
  state: 'open' as const,
  x: data.x ?? null,
  y: data.y ?? null,
  width: null,
  height: null,
  zIndex: maxZ + 1,
}
```

- [ ] **Step 3: Update the openWindow mutation type in useGMScreens.ts**

In `app/hooks/useGMScreens.ts`, update the `openWindowMutation` mutationFn parameter type:

```typescript
const openWindowMutation = useMutation({
  mutationFn: ({ screenId, collection, documentId, x, y }: {
    screenId: string
    collection: string
    documentId: string
    x?: number | null
    y?: number | null
  }) =>
    openWindowFn({ data: { screenId, campaignId, collection, documentId, x, y } }),
  onSuccess: (_data, vars) => { invalidateDetail(vars.screenId) },
  onError: (e) => { captureException(e, { action: 'openWindow' }) },
})
```

- [ ] **Step 4: Verify the app builds**

Run: `npm run build` (or the project's build command)
Expected: No type errors, clean build.

- [ ] **Step 5: Commit**

```bash
git add app/types/schemas/gmscreens.ts app/server/functions/gmscreens.ts app/hooks/useGMScreens.ts
git commit -m "feat(gmscreens): add optional x/y coordinates to openWindow"
```

---

### Task 2: Make note cards draggable in the Inspector

**Files:**
- Modify: `app/components/mainview/notes/NotesListWidget.tsx:67-113`

- [ ] **Step 1: Add drag handlers to the note card button**

In `app/components/mainview/notes/NotesListWidget.tsx`, update each note's `<button>` element (around line 70-74). Replace the `<button>` with a `<div>` since `<button>` elements have inconsistent drag behavior across browsers:

```tsx
<div
  key={note.id}
  role="button"
  tabIndex={0}
  draggable="true"
  onDragStart={(e) => {
    e.dataTransfer.setData(
      'application/x-cartyx-document',
      JSON.stringify({
        collection: 'note',
        documentId: note.id,
        title: note.title,
      }),
    )
    e.dataTransfer.effectAllowed = 'copy'
    e.currentTarget.style.opacity = '0.4'
  }}
  onDragEnd={(e) => {
    e.currentTarget.style.opacity = ''
  }}
  onClick={() => onNoteClick(note)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onNoteClick(note)
    }
  }}
  className="flex flex-col gap-2 p-4 text-left border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors group cursor-grab active:cursor-grabbing"
>
```

Note: The rest of the card content remains unchanged — only the wrapping element and its attributes change.

- [ ] **Step 2: Verify drag starts in the browser**

Run the dev server, open the inspector Notes tab, and drag a note card. You should see:
- The card becomes semi-transparent (opacity 0.4)
- A ghost image follows the cursor
- Releasing restores full opacity

- [ ] **Step 3: Commit**

```bash
git add app/components/mainview/notes/NotesListWidget.tsx
git commit -m "feat(notes): make note cards draggable with native HTML DnD"
```

---

### Task 3: Add drop target to GM Screen with position calculation and duplicate flash

**Files:**
- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx:40-44` (state), `203-206` (handleOpenItem), `326-350` (workspace JSX)

- [ ] **Step 1: Add drop zone state and ref**

In `GMScreensView.tsx`, add state and a ref for the workspace container near the top of the component (after the existing state declarations around line 43):

```typescript
const [isDragOver, setIsDragOver] = useState(false)
const [flashWindowId, setFlashWindowId] = useState<string | null>(null)
const workspaceRef = useRef<HTMLDivElement>(null)
```

Also add `useRef` to the existing import from `react` (line 1) if not already there — it is already imported.

- [ ] **Step 2: Add drag event handlers**

Add these handler functions after `handleOpenItem` (around line 206):

```typescript
const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  if (!e.dataTransfer.types.includes('application/x-cartyx-document')) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  setIsDragOver(true)
}, [])

const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  // Only clear when leaving the container, not when entering a child
  if (e.currentTarget.contains(e.relatedTarget as Node)) return
  setIsDragOver(false)
}, [])

const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  setIsDragOver(false)

  if (!activeScreenId || !activeScreen) return

  const raw = e.dataTransfer.getData('application/x-cartyx-document')
  if (!raw) return

  let payload: { collection: string; documentId: string; title: string }
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }

  // Check for duplicate
  const existing = activeScreen.windows.find(
    (w) => w.collection === payload.collection && w.documentId === payload.documentId,
  )

  if (existing) {
    // Focus + flash the existing window
    const maxZ = activeScreen.windows.reduce((max, w) => Math.max(max, w.zIndex), 0)
    mutations.updateWindow.mutate({
      screenId: activeScreenId,
      windowId: existing.id,
      zIndex: maxZ + 1,
      state: 'open',
    })
    setFlashWindowId(existing.id)
    setTimeout(() => setFlashWindowId(null), 700)
    return
  }

  // Calculate drop position relative to the workspace container
  const rect = workspaceRef.current?.getBoundingClientRect()
  const x = rect ? e.clientX - rect.left : 100
  const y = rect ? e.clientY - rect.top : 100

  mutations.openWindow.mutate({
    screenId: activeScreenId,
    collection: payload.collection,
    documentId: payload.documentId,
    x,
    y,
  })
}, [activeScreenId, activeScreen, mutations])
```

- [ ] **Step 3: Attach handlers and visual feedback to the workspace div**

Update the workspace `<div>` (the `role="tabpanel"` div around line 346) to include the ref, handlers, and conditional highlight class:

```tsx
<div
  ref={workspaceRef}
  id={activeScreenId ? `gmscreen-tabpanel-${activeScreenId}` : 'gmscreen-tabpanel'}
  role="tabpanel"
  aria-labelledby={activeScreenId ? `screen-tab-${activeScreenId}` : undefined}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  className={[
    'relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_38%),linear-gradient(180deg,#111827_0%,#0D1117_100%)]',
    'transition-shadow duration-200',
    isDragOver ? 'ring-2 ring-inset ring-blue-500/40 bg-blue-500/[0.03]' : '',
  ].join(' ')}
>
```

- [ ] **Step 4: Pass flashWindowId to FloatingWindowManager**

Update the `FloatingWindowManager` usage to pass the flash ID. First, add the `flashWindowId` to each managed window's data so FloatingWindow can apply the animation. Update the `localWindows` state merge (the `useEffect` around line 242) — in the `merged` mapping, add a `className` prop:

In the return block for **existing** windows (around line 265):
```typescript
return {
  ...existing,
  title,
  className: flashWindowId === existing.id ? 'animate-flash-border' : '',
  content: (
    <div className="p-4 font-sans text-xs text-slate-400">
      <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">{w.collection}</p>
      <p className="text-slate-300">{title}</p>
    </div>
  ),
}
```

In the return block for **new** windows (around line 278):
```typescript
return {
  id: w.id,
  title,
  position: w.x != null && w.y != null ? { x: w.x, y: w.y } : undefined,
  size: w.width != null && w.height != null ? { width: w.width, height: w.height } : undefined,
  state: toFloatingState(w.state),
  zIndex: w.zIndex,
  className: flashWindowId === w.id ? 'animate-flash-border' : '',
  content: (
    <div className="p-4 font-sans text-xs text-slate-400">
      <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">{w.collection}</p>
      <p className="text-slate-300">{title}</p>
    </div>
  ),
}
```

Add `flashWindowId` to the `useEffect` dependency array for this effect.

- [ ] **Step 5: Add the flash animation CSS**

Check where Tailwind is configured. Add a custom `animate-flash-border` keyframe. In the project's `tailwind.config.ts` (or `.js`), add under `theme.extend`:

```typescript
keyframes: {
  'flash-border': {
    '0%, 100%': { boxShadow: 'inset 0 0 0 2px transparent' },
    '25%, 75%': { boxShadow: 'inset 0 0 0 2px rgba(59, 130, 246, 0.6)' },
  },
},
animation: {
  'flash-border': 'flash-border 0.7s ease-in-out',
},
```

If the project already has `keyframes`/`animation` in the config, merge into the existing objects.

- [ ] **Step 6: Ensure FloatingWindow passes className through**

Check that `FloatingWindow.tsx` uses the `className` prop on the outer div. Looking at the code (line 286-289), it already does:
```tsx
className={[
  'rounded-lg border border-white/[0.07] bg-[#0D1117] overflow-hidden shadow-2xl shadow-black/60 outline-none',
  isMaximized ? 'absolute inset-0' : 'absolute left-0 top-0',
  className,
].join(' ')}
```

And `FloatingWindowManager` must pass `className` from `ManagedWindow` to `FloatingWindow`. Check `FloatingWindowManager.tsx` — if `ManagedWindow` doesn't have a `className` field, add it to the type and pass it through.

In `app/components/mainview/FloatingWindowManager.tsx`, add `className?: string` to the `ManagedWindow` interface and pass it to `<FloatingWindow className={w.className}>`.

- [ ] **Step 7: Verify the full flow in the browser**

1. Open the app, navigate to a campaign with a GM Screen and notes
2. Drag a note from the inspector — the screen should highlight with a blue ring
3. Drop the note — a new window should appear at the drop position
4. Drag the same note again and drop — the existing window should flash blue, no duplicate created
5. Refresh the page — the window should reappear at the same position

- [ ] **Step 8: Commit**

```bash
git add app/components/mainview/gmscreens/GMScreensView.tsx app/components/mainview/FloatingWindowManager.tsx tailwind.config.ts
git commit -m "feat(gmscreens): add drop target for notes with position and duplicate flash"
```

---

### Task 4: Handle edge cases

**Files:**
- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx`

- [ ] **Step 1: Prevent drop when no screen is active**

The `handleDrop` function already guards with `if (!activeScreenId || !activeScreen) return`. Verify that `handleDragOver` also doesn't show the highlight when there's no active screen:

```typescript
const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  if (!activeScreenId) return
  if (!e.dataTransfer.types.includes('application/x-cartyx-document')) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  setIsDragOver(true)
}, [activeScreenId])
```

- [ ] **Step 2: Clear drag highlight on screen switch**

Add a cleanup effect that resets `isDragOver` when the active screen changes:

```typescript
useEffect(() => {
  setIsDragOver(false)
  setFlashWindowId(null)
}, [activeScreenId])
```

Place this near the other `activeScreenId`-dependent effects.

- [ ] **Step 3: Verify edge cases in the browser**

1. Drag a note when no screens exist — no highlight should appear
2. Switch screens while dragging — highlight should clear
3. Drag something that isn't a note (e.g., text selection) — no highlight, no drop accepted

- [ ] **Step 4: Commit**

```bash
git add app/components/mainview/gmscreens/GMScreensView.tsx
git commit -m "fix(gmscreens): handle edge cases for note drag-and-drop"
```
