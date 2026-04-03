import { GMScreen } from '../db/models/GMScreen'

// ---------------------------------------------------------------------------
// removeDocumentRefsFromScreens — cleanup when a referenced document is deleted
//
// Lives in a separate file from the createServerFn exports so that importing
// it from other server modules (e.g. notes.ts) doesn't force the bundler to
// pull the full gmscreens.ts module into any client chunk.
// ---------------------------------------------------------------------------

/**
 * Remove all window and stack-item references to a given document from every
 * GM Screen in the campaign. Returns the number of distinct screens that were
 * modified and refreshes `updatedAt` on each touched screen.
 */
export async function removeDocumentRefsFromScreens(
  campaignId: string,
  collection: string,
  documentId: string,
): Promise<number> {
  // Find all distinct screens that reference this document (windows OR stacks)
  const affectedScreens = await GMScreen.find(
    {
      campaignId,
      $or: [
        { 'windows.collection': collection, 'windows.documentId': documentId },
        { 'stacks.items.collection': collection, 'stacks.items.documentId': documentId },
      ],
    },
    '_id',
  ).lean() as Array<{ _id: unknown }>

  if (affectedScreens.length === 0) return 0

  const now = new Date()

  // Pull matching refs and refresh updatedAt in parallel
  await Promise.all([
    GMScreen.updateMany(
      { campaignId, 'windows.collection': collection, 'windows.documentId': documentId },
      { $pull: { windows: { collection, documentId } }, $set: { updatedAt: now } },
    ),
    GMScreen.updateMany(
      { campaignId, 'stacks.items.collection': collection, 'stacks.items.documentId': documentId },
      { $pull: { 'stacks.$[].items': { collection, documentId } }, $set: { updatedAt: now } },
    ),
  ])

  return affectedScreens.length
}
