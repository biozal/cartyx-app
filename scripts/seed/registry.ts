import { users } from './users';

/**
 * Seeders are registered per subsystem as each one moves to the graph. Order is
 * dependency order: a seeder may rely on everything registered before it, so clearing
 * runs in reverse. Subsystems still on MongoDB are handled by the legacy scripts the
 * CLI delegates to, and drop out of that delegation as their slice lands.
 */
export interface Seeder {
  name: string;
  seed(): Promise<void>;
  clear(): Promise<void>;
}

export const seeders: Seeder[] = [users];

export async function runSeeders(list: Seeder[], action: 'seed' | 'clear'): Promise<string[]> {
  const ordered = action === 'seed' ? list : [...list].reverse();
  const ran: string[] = [];
  for (const seeder of ordered) {
    try {
      await seeder[action]();
    } catch (error) {
      // Stop at the first failure: a half-built environment is worse than none.
      throw new Error(
        `${seeder.name}: ${error instanceof Error ? error.message : 'seeder failed'}`,
        { cause: error }
      );
    }
    ran.push(seeder.name);
  }
  return ran;
}
