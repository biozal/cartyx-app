import { Campaign } from './models/Campaign'
import { GMScreen } from './models/GMScreen'
import { Player } from './models/Player'
import { Session } from './models/Session'
import { User } from './models/User'

let bootstrapped = false

/**
 * Ensures all collections exist and indexes are created/verified at startup.
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
 * `ensureIndexes` are idempotent MongoDB operations that no-op when the
 * collection/index already exists, so they're safe to run on every boot.
 * This guarantees that any environment with a valid MONGODB_URI is query-ready
 * immediately, with no manual steps and no migration history to track.
 *
 * ### Tradeoffs
 * - Adds a small amount of latency to the first request (collection + index
 *   verification). In practice this is <100 ms against an idle cluster.
 * - If the schema grows to need destructive changes (dropping indexes, renaming
 *   fields, backfilling data), a proper migration tool should be introduced at
 *   that point — bootstrap only handles additive, idempotent operations.
 * - `ensureIndexes` will throw if a schema-defined index conflicts with an
 *   existing index that has different options. This is intentional — it surfaces
 *   drift early rather than silently ignoring it.
 *
 * Safe to call multiple times — runs only once per process. If it throws, the
 * flag stays `false` so the next `connectDB()` call will retry.
 */
export async function bootstrapDB(): Promise<void> {
  if (bootstrapped) return

  await Promise.all([
    User.createCollection(),
    Campaign.createCollection(),
    Player.createCollection(),
    Session.createCollection(),
    GMScreen.createCollection(),
  ])

  await Promise.all([
    User.ensureIndexes(),
    Campaign.ensureIndexes(),
    Player.ensureIndexes(),
    Session.ensureIndexes(),
    GMScreen.ensureIndexes(),
  ])

  bootstrapped = true
}

/** Returns whether bootstrap has completed successfully. */
export function isBootstrapped(): boolean {
  return bootstrapped
}

/** Reset the bootstrap flag (for testing only). */
export function resetBootstrapFlag(): void {
  bootstrapped = false
}
