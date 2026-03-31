import { ensureCollections, syncCollectionsAndIndexes } from './inspect'

let bootstrapped = false
let bootstrapPromise: Promise<void> | null = null

/**
 * Ensures all collections exist at startup, and in non-production environments
 * also creates any missing indexes.
 *
 * ## Why bootstrap at startup instead of migrations or CI-only checks?
 *
 * **Migrations** (e.g. migrate-mongo) add operational weight: every deploy needs
 * a migration runner, ordering matters, and missed steps silently break reads.
 * For a young schema that's still evolving, the ceremony outweighs the benefit.
 *
 * **CI-only index checks** verify intent but don't create anything — if a new
 * environment (local dev, staging, preview deploy) starts from an empty database,
 * queries hit full collection scans until someone manually runs a setup script.
 *
 * **Startup bootstrap** sidesteps both problems: `createCollection` and
 * `createIndexes` are idempotent MongoDB operations that no-op when the
 * collection/index already exists, so they're safe to run on every boot.
 * This guarantees that any non-production environment with a valid MONGODB_URI
 * is query-ready immediately, with no manual steps and no migration history
 * to track.
 *
 * ### Production behaviour
 * In production, bootstrap only creates collections — it does **not** call
 * `createIndexes`. This avoids implicit index creation on app startup, which
 * can lock collections and cause latency spikes on large datasets. Operators
 * should use `npm run db:sync` for controlled index management and
 * `npm run db:verify` as a pre-deploy gate.
 *
 * ### Tradeoffs
 * - Adds a small amount of latency to the first request (collection
 *   verification). In practice this is <100 ms against an idle cluster.
 * - If the schema grows to need destructive changes (dropping indexes, renaming
 *   fields, backfilling data), a proper migration tool should be introduced at
 *   that point — bootstrap only handles additive, idempotent operations.
 *
 * Safe to call multiple times — runs only once per process. If it throws, the
 * flag stays `false` so the next `connectDB()` call will retry.
 *
 * @param production — when true, only creates collections (no index sync).
 *   Defaults to `process.env.NODE_ENV === 'production'`.
 */
export async function bootstrapDB(
  production = process.env.NODE_ENV === 'production',
): Promise<void> {
  if (bootstrapped) return

  // If a bootstrap is already in flight, share the same attempt so
  // concurrent callers don't duplicate collection/index setup.
  if (bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    try {
      if (production) {
        await ensureCollections()
      } else {
        await syncCollectionsAndIndexes()
      }
      bootstrapped = true
    } finally {
      bootstrapPromise = null
    }
  })()

  return bootstrapPromise
}

/** Returns whether bootstrap has completed successfully. */
export function isBootstrapped(): boolean {
  return bootstrapped
}

/** @internal Reset module state — test-only. Not part of the public API. */
export function __resetBootstrapForTests(): void {
  bootstrapped = false
  bootstrapPromise = null
}
