/**
 * Seeding and clearing rebuild an environment's data, so the target is checked before
 * anything runs. The Mongo scripts these replace refused production the same way: by
 * NODE_ENV and by the word "prod" appearing in the target, rather than by trusting the
 * caller to pass the right environment name.
 */
export interface SeedTarget {
  NODE_ENV?: string;
  GREMLIN_URL?: string;
  CQL_STATE_KEYSPACE?: string;
  CQL_CONTACT_POINT?: string;
  R2_BUCKET?: string;
  /** Checked while subsystems are still on MongoDB; the seeder writes their documents. */
  MONGODB_URI?: string;
}

const REQUIRED: (keyof SeedTarget)[] = ['GREMLIN_URL', 'CQL_STATE_KEYSPACE', 'CQL_CONTACT_POINT'];
// The media bucket is optional: seeding writes no media unless image generation runs.
const CHECKED: (keyof SeedTarget)[] = [...REQUIRED, 'R2_BUCKET', 'MONGODB_URI'];

export function assertSeedTargetIsNotProduction(target: SeedTarget = process.env): void {
  if (target.NODE_ENV === 'production')
    throw new Error('Refusing to seed or clear with NODE_ENV=production');
  for (const key of REQUIRED)
    if (!target[key]?.trim()) throw new Error(`${key} is required to choose a seed target`);
  for (const key of CHECKED) {
    const value = target[key];
    if (value && /prod/i.test(value))
      throw new Error(`${key} names a production target ("${value}"); refusing to seed or clear`);
  }
}
