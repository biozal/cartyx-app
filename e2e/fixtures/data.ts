/**
 * Graph-backed data access for Playwright global setup and specs.
 *
 * Global setup runs as a standalone Node script outside the app's bundling, so
 * everything here imports by relative path rather than the `~` alias.
 *
 * Subsystems arrive one slice at a time: each slice replaces its Mongo fixture
 * code with calls to the store opened here. Until the last slice lands, global
 * setup uses both this module and mongoose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createGraphClient } from '../../app/server/db/graph/client';
import { readGraphConfig } from '../../app/server/db/graph/config';
import { defineEntity } from '../../app/server/db/graph/entity-codec';
import type { EntityStore } from '../../app/server/db/graph/entity-store';
import { createGraphEntityStore } from '../../app/server/db/graph/graph-entity-store';
import type { EntityScope } from '../../app/server/db/graph/identity';
import { ObjectId } from '../../scripts/graph-db';

export const E2E_SCOPE: EntityScope = { type: 'global' };

let store: EntityStore | undefined;

/**
 * The store fixtures write through. It uses the restricted application principal,
 * exactly as the running app does, so a fixture cannot set up state the product
 * itself would be refused. The transport opens and closes a connection per
 * request, so there is nothing to shut down at the end of a run.
 */
export function entityStore(): EntityStore {
  if (!store) {
    const config = readGraphConfig();
    if (config.username === 'cartyx_admin')
      throw new Error('E2E fixtures must not use the operator credential');
    store = createGraphEntityStore(createGraphClient(config));
  }
  return store;
}

/** Counted, never written: the probe exercises the index, serializer and policy. */
const readinessProbe = defineEntity({
  kind: 'ReadinessProbe',
  version: 1,
  schema: z.object({}),
  index: {},
});

/**
 * Fails before any seeding when the graph is unreachable or its schema is absent.
 * Without this, a missing stack surfaces much later as an unexplained empty page
 * in whichever spec happens to run first.
 */
export async function assertGraphReady(): Promise<void> {
  try {
    await entityStore().count(readinessProbe, E2E_SCOPE);
  } catch (cause) {
    throw new Error(
      'The graph is not reachable with a usable schema. Start it with `npm run db:up` ' +
        'and install the schema with `npm run graph:schema -- apply`.',
      { cause }
    );
  }
}

/**
 * The seeded game master, as the specs need it: an id they can put in Mongo documents
 * that still hold campaign data, and the provider id their session cookie carries.
 *
 * Identity is served from the graph, so there is no `users` row to query. Global setup
 * resolves the account once and records it, which also keeps every spec agreeing on who
 * the game master is without eighteen of them opening their own connection.
 */
export function seededGameMaster(expectedProviderId?: string): {
  _id: ObjectId;
  providerId: string;
} {
  const path = join(process.cwd(), 'e2e', '.auth', 'seed-data.json');
  let seed: { gmUserId?: string; gmProviderId?: string };
  try {
    seed = JSON.parse(readFileSync(path, 'utf-8')) as typeof seed;
  } catch (cause) {
    throw new Error('No seed data — globalSetup did not run?', { cause });
  }
  if (!seed.gmUserId || !seed.gmProviderId)
    throw new Error('Seed data has no game master; re-run `npm run dev:seed`');
  // A cookie minted for somebody else would otherwise provision against the wrong owner.
  if (expectedProviderId && expectedProviderId !== seed.gmProviderId)
    throw new Error('The session cookie is not the seeded game master');
  return { _id: new ObjectId(seed.gmUserId), providerId: seed.gmProviderId };
}

/**
 * Creates an identity the way a first login does, so a spec can mint a session for
 * somebody other than the game master. Idempotent: the same provider id resolves to the
 * same account across runs, which is what makes re-running a spec safe.
 *
 * The role is not settable here, by design — a login cannot promote anybody. Specs that
 * need a role put it in the session they mint, which is what the application reads.
 */
export async function seedIdentity(input: {
  provider: string;
  providerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ _id: ObjectId; providerId: string; provider: string; email: string }> {
  const { identityRepository } = await import('../../app/server/repositories/identity');
  const profile = await identityRepository.recordLogin({
    provider: input.provider,
    providerId: input.providerId,
    email: input.email,
    ...(input.firstName && { firstName: input.firstName }),
    ...(input.lastName && { lastName: input.lastName }),
    oauthTokens: { accessToken: null, refreshToken: null },
    lastLoginAt: new Date(),
  });
  return {
    _id: new ObjectId(profile.id),
    providerId: input.providerId,
    provider: input.provider,
    email: input.email,
  };
}

/** Preferences live in the published profile now, not on a Mongo user document. */
export async function readRulerColor(providerId: string): Promise<string | null> {
  const { identityRepository } = await import('../../app/server/repositories/identity');
  return (await identityRepository.readPreferences(providerId))?.rulerColor ?? null;
}

export async function writeRulerColor(providerId: string, rulerColor: string): Promise<void> {
  const { identityRepository } = await import('../../app/server/repositories/identity');
  await identityRepository.setRulerColor(providerId, rulerColor);
}

/** Releases the pools a spec opened, so the worker is not held open by the driver. */
export async function closeIdentity(): Promise<void> {
  const { closeData } = await import('../../app/server/db/data-runtime');
  await closeData();
}
