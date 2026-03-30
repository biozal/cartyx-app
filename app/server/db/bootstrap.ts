import { Campaign } from './models/Campaign'
import { GMScreen } from './models/GMScreen'
import { Player } from './models/Player'
import { Session } from './models/Session'
import { User } from './models/User'

let bootstrapped = false

/**
 * Ensures all collections exist and indexes are created/verified.
 * Safe to call multiple times — runs only once per process.
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

/** Reset the bootstrap flag (for testing only). */
export function resetBootstrapFlag(): void {
  bootstrapped = false
}
