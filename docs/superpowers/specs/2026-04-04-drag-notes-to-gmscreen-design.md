# Drag Notes from Inspector to GM Screen

**Date:** 2026-04-04
**Status:** Approved

## Summary

Allow notes to be dragged from the Inspector's Notes panel and dropped onto the GM Screen to create a new floating window at the drop position. Windows persist position/size across tab changes and re-login via the existing `GMScreen.windows` schema.

## Approach

Native HTML Drag and Drop API. No new dependencies. Fits the project's existing pattern of raw browser events (FloatingWindow uses mouse events for drag/resize).

## Design

### Drag Source (Inspector Notes)

Each note card in `NotesPanel.tsx` gets:
- `draggable="true"`
- `onDragStart`: Sets `dataTransfer` with custom MIME type and note metadata. Applies a "dragging" visual state (reduced opacity).
- `onDragEnd`: Clears the dragging visual state.

Data format:
```
MIME: application/x-cartyx-document
Data: JSON { collection: "note", documentId: "...", title: "..." }
```

Custom MIME type prevents accidental drops from external sources being interpreted as notes.

### Drop Target (GM Screen Area)

The GM Screen container in `GMScreensView.tsx` listens for:
- **`dragover`**: Checks `dataTransfer` types for custom MIME. If present, calls `preventDefault()` to allow drop. Adds visual highlight (subtle border glow or background tint) to indicate a valid drop zone.
- **`dragleave`**: Removes the highlight.
- **`drop`**: Parses the note data, calculates drop position relative to the container (`e.clientX/Y - container.getBoundingClientRect()`), then either opens a new window or handles the duplicate case.

Drop position is passed to the existing `openWindow` mutation which already accepts `x`, `y`, `width`, `height`.

### Duplicate Detection & Focus

On drop, check the current screen's `windows` array for a matching `collection + documentId`. If found:
1. Skip the `openWindow` call.
2. Bring the existing window to the front (highest `zIndex`).
3. If minimized, restore to `open` state.
4. Apply a brief CSS flash animation (pulse on window border) to indicate which window matched.

Uses the existing `updateWindow` mutation. No new server logic.

## Files Changed

| File | Change |
|------|--------|
| `app/components/mainview/notes/NotesPanel.tsx` (or note card child) | Add `draggable`, `onDragStart`, `onDragEnd` handlers |
| `app/components/mainview/gmscreens/GMScreensView.tsx` | Add `onDragOver`, `onDragLeave`, `onDrop` handlers with position calculation, duplicate check, highlight state |
| CSS (existing stylesheet or inline) | Dragging opacity class, drop zone highlight, duplicate flash animation |

## No Server Changes

The existing `openWindow` and `updateWindow` server functions and mutations handle all persistence. No schema, API, or validation changes needed.

## Out of Scope

- Touch/mobile drag support
- Drag from GM Screen back to inspector
- Drag between screens
- Keyboard-driven alternative to drag
- Drag-and-drop for other document types (can be added later via the `collection` field)
