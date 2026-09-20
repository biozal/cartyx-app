import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Seeder } from './registry';

/**
 * The game master every other seeder and E2E spec hangs off, and the campaigns' owner.
 *
 * Seeded as an account with an email and NO provider binding, exactly like the players
 * below, so the first real Google login with that address CLAIMS it and gets the
 * campaigns with it. Recording a login here instead would bind a made-up provider id,
 * and the real login would then be refused as a different person with the same email
 * ("Identity login reservation cannot select this account") — which is what happened
 * until 2026-09-19. E2E does the claiming itself, with GM_PROVIDER_ID, because its
 * session cookie carries a provider id (see e2e/globalSetup.ts).
 *
 * The role is published here rather than by a login, because nothing in the product
 * assigns roles: a login cannot promote anybody.
 *
 * Idempotent: an address that already has an account resolves to it, bound or not.
 */
export const GM_PROVIDER = 'google';
export const GM_PROVIDER_ID = 'seed-gm-alabeau';
export const GM_EMAIL = 'alabeau@gmail.com';

export async function seedGameMaster(): Promise<string> {
  const { id, created } = await seedAccount({
    email: GM_EMAIL,
    firstName: 'Aaron',
    lastName: 'LaBeau',
    role: 'gm',
  });
  // An account seeded before the role existed, or claimed by a login, still needs the role.
  if (!created) await ensureGameMaster(id);
  return id;
}

/** Publishes the `gm` role on an account that does not already carry it. */
async function ensureGameMaster(userId: string): Promise<void> {
  const profiles = await identityProfiles();
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

async function identityProfiles() {
  const { getGraphClient, getStateStore } = await import('../../app/server/db/data-runtime');
  const { createGraphProfileStore } =
    await import('../../app/server/repositories/identity/graph-profiles');
  const { createIdentityProfiles } =
    await import('../../app/server/repositories/identity/profile-head');
  return createIdentityProfiles(getStateStore(), createGraphProfileStore(getGraphClient()));
}

/**
 * One placeholder account: an email reservation, an unbound account and a published
 * profile, created the way the operator importer creates an account. Returns the
 * existing account's id when the address already has one.
 */
async function seedAccount(person: {
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'gm' | 'player' | 'unknown';
}): Promise<{ id: string; created: boolean }> {
  const { getGraphClient, getStateStore } = await import('../../app/server/db/data-runtime');
  const { createGraphProfileStore } =
    await import('../../app/server/repositories/identity/graph-profiles');
  const { createIdentityReservations } =
    await import('../../app/server/repositories/identity/reservations');
  const { createIdentityImporter, parseIdentityImportPlan } =
    await import('../identity/import-account');
  const state = getStateStore();
  const existing = await createIdentityReservations(state).findOwner({
    kind: 'email',
    value: person.email,
  });
  if (existing) return { id: existing, created: false };

  const userId = randomBytes(12).toString('hex');
  await createIdentityImporter(state, createGraphProfileStore(getGraphClient())).apply(
    parseIdentityImportPlan({
      version: 1,
      // Nothing is imported from a source; the digest only identifies this plan.
      sourceSha256: createHash('sha256').update(`seed:${person.email}`).digest('hex'),
      reservationOperationId: randomUUID(),
      profileOperationId: randomUUID(),
      account: {
        kind: 'import',
        operationId: randomUUID(),
        userId,
        binding: null,
        email: person.email,
        audioStoragePrefix: null,
        tokens: null,
      },
      snapshot: {
        userId,
        snapshotId: randomBytes(12).toString('hex'),
        content: {
          firstName: person.firstName ?? null,
          lastName: person.lastName ?? null,
          avatarUrl: null,
          role: person.role,
          rulerColor: null,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        },
      },
    })
  );
  return { id: userId, created: true };
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
  const players = [];
  for (const email of PLAYER_EMAILS)
    players.push({ email, id: (await seedAccount({ email, role: 'unknown' })).id });
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
