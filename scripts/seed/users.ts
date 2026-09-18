import { randomBytes, randomUUID } from 'node:crypto';
import { identityRepository } from '../../app/server/repositories/identity';
import type { Seeder } from './registry';

/**
 * The game master every other seeder and E2E spec hangs off.
 *
 * The account is created by recording a login, which is exactly what the product does,
 * so the seeded identity is reachable by the same provider id the E2E session cookie
 * carries. Roles are deliberately not login-owned — a login cannot promote anybody — so
 * the role is published separately, through the profile head.
 *
 * Seeding is idempotent: recording the same login twice resolves to the same account.
 * Clearing leaves accounts alone, which is what `dev_clear.py` has always done; an
 * environment is rebuilt by recreating its data, not its people.
 */
export const GM_PROVIDER = 'google';
export const GM_PROVIDER_ID = 'seed-gm-alabeau';
export const GM_EMAIL = 'alabeau@gmail.com';

export async function seedGameMaster(): Promise<string> {
  const existing = await identityRepository.findUserId(GM_PROVIDER_ID);
  const profile = await identityRepository.recordLogin({
    provider: GM_PROVIDER,
    providerId: GM_PROVIDER_ID,
    email: GM_EMAIL,
    firstName: 'Aaron',
    lastName: 'LaBeau',
    oauthTokens: { accessToken: null, refreshToken: null },
    lastLoginAt: new Date(),
  });
  if (existing && existing !== profile.id)
    throw new Error('The seeded game master resolved to a different account');
  if (profile.role !== 'gm') await promoteToGameMaster(profile.id);
  return profile.id;
}

/**
 * Operator-shaped, because nothing in the product assigns a role. It reads the current
 * published profile and republishes it with the role set, against the revision it read,
 * so a concurrent publication is rejected rather than silently overwritten.
 */
async function promoteToGameMaster(userId: string): Promise<void> {
  const { getGraphClient, getStateStore } = await import('../../app/server/db/data-runtime');
  const { createGraphProfileStore } =
    await import('../../app/server/repositories/identity/graph-profiles');
  const { createIdentityProfiles } =
    await import('../../app/server/repositories/identity/profile-head');
  const profiles = createIdentityProfiles(
    getStateStore(),
    createGraphProfileStore(getGraphClient())
  );
  const current = await profiles.read(userId);
  if (!current) throw new Error('The seeded game master has no published profile');
  if (current.snapshot.content.role === 'gm') return;
  const operationId = randomUUID();
  await profiles.begin({
    operationId,
    expectedRevision: current.revision,
    snapshot: {
      userId,
      snapshotId: randomBytes(12).toString('hex'),
      content: { ...current.snapshot.content, role: 'gm' },
    },
  });
  if ((await profiles.resume(operationId)) !== 'applied')
    throw new Error('Publishing the seeded game master role was rejected');
}

export const users: Seeder = {
  name: 'users',
  async seed() {
    const id = await seedGameMaster();
    process.stdout.write(`Game master ${GM_EMAIL} is ${id}\n`);
  },
  async clear() {
    // Accounts survive a clear, exactly as they did under `dev_clear.py`.
  },
};
