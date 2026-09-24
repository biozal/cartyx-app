import { connectDB, isDBConnected } from '../db/connection';
import { AudioAsset } from '../db/models/AudioAsset';

/**
 * Per-user R2 storage usage, aggregated on demand rather than kept as a
 * denormalised counter on `User`.
 *
 * WHY ON DEMAND, NOT A COUNTER
 * -----------------------------
 * A counter needs a writer at every place bytes are added or removed:
 * `confirmAudioUpload` (source lands), `processAsset`'s success path
 * (renditions land), `deleteAudioAsset` (asset removed), and both the
 * worker's and the upload-side reapers (abandoned rows removed). Phase 2a's
 * adversarial review found correctness bugs in three of those exact
 * functions. A drifted quota either blocks a user who is actually under it
 * or admits one who is actually over — both are worse than the cost of this
 * query.
 *
 * COST, AND WHY IT IS STILL THE RIGHT TRADE
 * -----------------------------------------
 * This reads the caller's own asset rows and adds them up in process. The
 * graph layer has no aggregation pipeline, and the entity store keeps each
 * document as a single JSON blob, so there is no projection that would make
 * the read cheaper — the rows come back whole either way.
 *
 * What bounds it is the quota itself: at the 2 GiB default and ~126 MB per
 * asset that is roughly 16 rows, and `ownerId` is an indexed slot so the read
 * narrows in the graph rather than scanning. A denormalised counter is still
 * the wrong answer for the same reason it always was — four writers, and the
 * phase 2a review found correctness bugs in three of them.
 */
export interface AudioStorageUsage {
  bytes: number;
  assetCount: number;
}

/**
 * The byte-bearing fields on one `AudioAsset` row.
 *
 * This mirrors `audio-cleanup.ts`'s `referencedKeys`, one level down
 * (`.bytes` instead of `.key`), over the same six object slots — and, as of
 * `onceSourceBytes` landing on the schema, the same COUNT too:
 *
 * - `referencedKeys` enumerates six key fields: `sourceKey`, `onceSourceKey`,
 *   and the four rendition `.key` slots. This list enumerates their `.bytes`
 *   counterparts — `onceSourceKey`'s is `onceSourceBytes`, set by
 *   `confirmOnceVariantUpload`'s success write, the once-variant analogue of
 *   `sourceBytes`/`confirmAudioUpload`.
 * - Rows written before `onceSourceBytes` existed simply lack the field; the
 *   `bytesAt` guard below treats that the same as any other unconfirmed slot
 *   and contributes 0, not `null`/`NaN`. No migration needed.
 * - The two lists still name different leaf fields (`.key` vs `.bytes`), so a
 *   single shared array can't drive both without adding structure whose only
 *   real consumer is a six-line list. Copied instead, deliberately, with this
 *   comment as the cross-reference: if `AudioAsset` ever grows a new
 *   rendition slot or source field, add its `.key` path to `referencedKeys`
 *   in `audio-cleanup.ts` AND its `.bytes` path here.
 */
const BYTES_FIELD_PATHS = [
  'sourceBytes',
  'onceSourceBytes',
  'renditions.opus.bytes',
  'renditions.aac.bytes',
  'onceRenditions.opus.bytes',
  'onceRenditions.aac.bytes',
] as const;

async function ensureDb() {
  if (!isDBConnected()) await connectDB();
}

/** Reads one dotted path, treating absent, null and non-finite alike as 0. */
function bytesAt(document: Record<string, unknown>, path: string): number {
  const value = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      document
    );
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Sum of every byte-bearing field across every asset a user owns, plus how
 * many asset rows contributed.
 *
 * Counts EVERY status, not just `ready` — an asset sitting in `pending` or
 * `processing` already occupies real R2 bytes (its source object, confirmed
 * by `confirmAudioUpload`'s `HeadObject` before the row ever reaches
 * `pending`), and counting only `ready` would let a user park unbounded
 * bytes there indefinitely.
 *
 * `bytesAt` guards every addend: a field that is `null` (never confirmed, or
 * a rendition slot never produced) or entirely absent (a rendition
 * sub-document that was never set) contributes `0` rather than poisoning the
 * total with `NaN`.
 */
export async function getUserStorageUsage(userId: string): Promise<AudioStorageUsage> {
  await ensureDb();

  // `ownerId` is an indexed slot, so this narrows in the graph rather than
  // scanning. There is deliberately NO projection: the entity store persists
  // each document as one JSON blob, so asking for fewer fields reads exactly
  // the same bytes off the wire and only trims the objects afterwards.
  const rows = (await AudioAsset.find({ ownerId: userId }).lean()) as Record<string, unknown>[];

  let bytes = 0;
  for (const row of rows) {
    for (const path of BYTES_FIELD_PATHS) bytes += bytesAt(row, path);
  }
  return { bytes, assetCount: rows.length };
}
