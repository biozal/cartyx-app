import type mongoose from 'mongoose'
import { Campaign } from './models/Campaign'
import { GMScreen } from './models/GMScreen'
import { Player } from './models/Player'
import { Session } from './models/Session'
import { User } from './models/User'

/** All Mongoose models the app declares. Order does not matter. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_MODELS: mongoose.Model<any>[] = [User, Campaign, Player, Session, GMScreen]

/** Describes one expected-vs-actual index comparison for a single model. */
export interface IndexDiff {
  /** Mongoose model name (e.g. "User"). */
  model: string
  /** MongoDB collection name (e.g. "users"). */
  collection: string
  /** Indexes declared in the schema but missing from the database. */
  missing: IndexSpec[]
  /** Indexes present in the database but not in the schema (excluding _id). */
  extra: IndexSpec[]
}

export interface IndexSpec {
  key: Record<string, unknown>
  options?: Record<string, unknown>
}

export interface InspectResult {
  /** Per-model diff reports. */
  diffs: IndexDiff[]
  /** true when every expected index exists (missing arrays are all empty). */
  ok: boolean
}

/**
 * Normalise an index key object to a stable string for comparison.
 * Mongoose and MongoDB may express the same key differently (e.g. `1` vs `"1"`).
 */
function keySignature(key: Record<string, unknown>): string {
  return Object.entries(key)
    .map(([field, dir]) => `${field}:${Number(dir)}`)
    .join(',')
}

/**
 * Compare schema-declared indexes against actual indexes in the database
 * for every model in ALL_MODELS.
 *
 * Does NOT mutate the database — safe to call in CI, pre-deploy, or
 * production as a read-only health check.
 */
export async function inspectIndexes(): Promise<InspectResult> {
  const diffs: IndexDiff[] = []

  for (const Model of ALL_MODELS) {
    const modelName = Model.modelName
    const collectionName = Model.collection.collectionName

    // Schema-declared indexes (compound + field-level).
    // schema.indexes() returns [keyPattern, options] tuples.
    const schemaIndexes: Array<[Record<string, unknown>, Record<string, unknown>]> =
      Model.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>

    // Actual indexes currently in MongoDB.
    let dbIndexes: Array<{ key: Record<string, unknown>; [k: string]: unknown }> = []
    try {
      dbIndexes = await Model.listIndexes()
    } catch {
      // Collection may not exist yet — treat as zero indexes.
    }

    // Build sets of key signatures for comparison.
    const schemaKeys = new Map<string, IndexSpec>()
    for (const [key, opts] of schemaIndexes) {
      const sig = keySignature(key)
      schemaKeys.set(sig, { key, options: opts })
    }

    const dbKeys = new Set<string>()
    for (const idx of dbIndexes) {
      // Skip the default _id index — it always exists.
      if (keySignature(idx.key) === '_id:1') continue
      dbKeys.add(keySignature(idx.key))
    }

    const missing: IndexSpec[] = []
    for (const [sig, spec] of schemaKeys) {
      if (!dbKeys.has(sig)) {
        missing.push(spec)
      }
    }

    const extra: IndexSpec[] = []
    for (const sig of dbKeys) {
      if (!schemaKeys.has(sig)) {
        const dbIdx = dbIndexes.find((i) => keySignature(i.key) === sig)
        if (dbIdx) extra.push({ key: dbIdx.key })
      }
    }

    diffs.push({ model: modelName, collection: collectionName, missing, extra })
  }

  const ok = diffs.every((d) => d.missing.length === 0)
  return { diffs, ok }
}

/**
 * Create any missing collections and sync (create) missing indexes.
 * This is the explicit, operator-controlled path — never called implicitly
 * at production runtime.
 */
export async function syncCollectionsAndIndexes(): Promise<void> {
  await Promise.all(ALL_MODELS.map((M) => M.createCollection()))
  await Promise.all(ALL_MODELS.map((M) => M.createIndexes()))
}
