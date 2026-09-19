import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

/**
 * Real accounts the team signs in with to play. Order matters: the campaign seed assigns
 * characters and portraits by position.
 */
export const PLAYER_EMAILS = [
  'cartyx.player1@gmail.com',
  'alabeauai@gmail.com',
  'costoda@gmail.com',
  'aalabeau@gmail.com',
];

/**
 * Players are seeded as accounts with an email and no provider, so the first real
 * Google login with that address claims the account and everything already attached to
 * it — the same way these placeholders worked when they were Mongo rows. Recording a
 * login here instead would bind a made-up provider id, and a real login would then be
 * refused as a different person with the same email.
 *
 * Idempotent: an address that already has an account resolves to it, bound or not.
 */
export async function seedPlayers(): Promise<{ email: string; id: string }[]> {
  const { getGraphClient, getStateStore } = await import('../../app/server/db/data-runtime');
  const { createGraphProfileStore } =
    await import('../../app/server/repositories/identity/graph-profiles');
  const { createIdentityReservations } =
    await import('../../app/server/repositories/identity/reservations');
  const { createIdentityImporter, parseIdentityImportPlan } =
    await import('../identity/import-account');
  const state = getStateStore();
  const reservations = createIdentityReservations(state);
  const importer = createIdentityImporter(state, createGraphProfileStore(getGraphClient()));

  const players = [];
  for (const email of PLAYER_EMAILS) {
    const existing = await reservations.findOwner({ kind: 'email', value: email });
    if (existing) {
      players.push({ email, id: existing });
      continue;
    }
    const userId = randomBytes(12).toString('hex');
    await importer.apply(
      parseIdentityImportPlan({
        version: 1,
        // Nothing is imported from a source; the digest only identifies this plan.
        sourceSha256: createHash('sha256').update(`seed:${email}`).digest('hex'),
        reservationOperationId: randomUUID(),
        profileOperationId: randomUUID(),
        account: {
          kind: 'import',
          operationId: randomUUID(),
          userId,
          binding: null,
          email,
          audioStoragePrefix: null,
          tokens: null,
        },
        snapshot: {
          userId,
          snapshotId: randomBytes(12).toString('hex'),
          content: {
            firstName: null,
            lastName: null,
            avatarUrl: null,
            role: 'unknown',
            rulerColor: null,
            createdAt: new Date().toISOString(),
            lastLoginAt: null,
          },
        },
      })
    );
    players.push({ email, id: userId });
  }
  return players;
}

export const users: Seeder = {
  name: 'users',
  async seed() {
    const id = await seedGameMaster();
    process.stdout.write(`Game master ${GM_EMAIL} is ${id}\n`);
    for (const player of await seedPlayers())
      process.stdout.write(`Player ${player.email} is ${player.id}\n`);
  },
  async clear() {
    // Accounts survive a clear, exactly as they did under `dev_clear.py`.
  },
};
