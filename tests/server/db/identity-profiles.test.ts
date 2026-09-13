// @vitest-environment node
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { StateRecord } from '~/server/db/cql/control-state';
import type { ReservationStateStore } from '~/server/repositories/identity/reservations';
import {
  type ImmutableProfileStore,
  type ProfileSnapshot,
  profileDigest,
  parseProfile,
  profileSnapshotSchema,
} from '~/server/repositories/identity/profile-model';
import { createIdentityProfiles } from '~/server/repositories/identity/profile-head';
import {
  identityProfileContract,
  profileFixture,
} from '../../../scripts/identity/profile-contract';
function memory() {
  const rows = new Map<string, StateRecord>();
  const snapshots = new Map<string, ProfileSnapshot>();
  const state: ReservationStateStore = {
    async get(key) {
      return structuredClone(rows.get(JSON.stringify(key)) ?? null);
    },
    async create(key, revision, value) {
      const id = JSON.stringify(key);
      if (rows.has(id)) return false;
      rows.set(id, structuredClone({ revision, value }));
      return true;
    },
    async replace(key, expected, revision, value) {
      const id = JSON.stringify(key);
      if (rows.get(id)?.revision !== expected) return false;
      rows.set(id, structuredClone({ revision, value }));
      return true;
    },
  };
  const graph: ImmutableProfileStore = {
    async get(userId, snapshotId) {
      return structuredClone(snapshots.get(`${userId}:${snapshotId}`) ?? null);
    },
    async put(input) {
      const snapshot = parseProfile(profileSnapshotSchema, input);
      const key = `${snapshot.userId}:${snapshot.snapshotId}`;
      const existing = snapshots.get(key);
      if (existing && profileDigest(existing) !== profileDigest(snapshot))
        throw new Error('Profile revision ID reused');
      snapshots.set(key, structuredClone(snapshot));
    },
  };
  return { state, graph };
}
it('recovers profile publication and combines graph content with settled account identities', async () => {
  const { state, graph } = memory();
  await identityProfileContract(state, graph);
});
it('rejects secret fields and malformed profile revisions before persistence', async () => {
  const { state, graph } = memory();
  const profiles = createIdentityProfiles(state, graph);
  const snapshot = profileFixture();
  const input = { operationId: randomUUID(), expectedRevision: null, snapshot };
  for (const invalid of [
    { ...input, snapshot: { ...snapshot, oauthTokens: 'forbidden' } },
    {
      ...input,
      snapshot: { ...snapshot, content: { ...snapshot.content, audioStoragePrefix: 'private' } },
    },
    { ...input, snapshot: { ...snapshot, content: { ...snapshot.content, role: 'admin' } } },
    { ...input, snapshot: { ...snapshot, content: { ...snapshot.content, firstName: '\ud800' } } },
    { ...input, expectedRevision: input.operationId },
  ])
    await expect(profiles.begin(invalid as never)).rejects.toThrow();
  expect(await profiles.read(snapshot.userId)).toBeNull();
});
