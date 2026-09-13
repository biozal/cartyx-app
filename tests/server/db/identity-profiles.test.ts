// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.unmock('mongoose');
import {
  identitySettingsContract,
  settingsSourceFixture,
} from '../../../scripts/identity/settings-contract';
import { identityImportContract } from '../../../scripts/identity/import-contract';
import { importSourceFixture } from '../../../scripts/identity/import-contract';
import { mapIdentitySource } from '../../../scripts/identity/import-source';
import { createIdentityImporter } from '../../../scripts/identity/import-account';
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
import { createTargetIdentitySettings } from '~/server/repositories/identity/target-settings';
import { identityAudioAssignmentKey } from '~/server/repositories/identity/audio-prefix';
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

it('recovers original account import across reservations, graph publication and authentication state', async () => {
  const { state, graph } = memory();
  await identityImportContract(state, graph);
});

it('reconciles an import completed by another worker during its initial empty-target check', async () => {
  const { state, graph } = memory();
  const plan = mapIdentitySource(importSourceFixture());
  let delay = true;
  const write = vi.fn(async () => {
    throw new Error('Completed import must not write');
  });
  const observer = createIdentityImporter(
    {
      get: async (key) => {
        const row = await state.get(key);
        if (delay && key.type === 'identity_import') {
          delay = false;
          await createIdentityImporter(state, graph).apply(plan);
        }
        return row;
      },
      create: write,
      replace: write,
    },
    graph
  );
  await observer.apply(plan);
  expect(write).not.toHaveBeenCalled();
});

it('preserves profile and token data through concurrent settings writes and media allocation recovery', async () => {
  const { state, graph } = memory();
  await identitySettingsContract(state, graph);
});

it('does not write settings after failed reads or an invalid media candidate', async () => {
  const { state, graph } = memory();
  const write = vi.fn(async () => {
    throw new Error('Unexpected write');
  });
  const broken = createTargetIdentitySettings(
    {
      get: async () => {
        throw new Error('Read unavailable');
      },
      create: write,
      replace: write,
    },
    graph
  );
  await expect(broken.setRulerColor('fixture_valid', '#123456')).rejects.toThrow(
    'Read unavailable'
  );
  await expect(broken.resolveAudioStoragePrefix('1'.repeat(24))).rejects.toThrow(
    'Read unavailable'
  );
  expect(write).not.toHaveBeenCalled();
  const plan = mapIdentitySource(settingsSourceFixture());
  await createIdentityImporter(state, graph).apply(plan);
  const invalid = createTargetIdentitySettings(state, graph, () => 'invalid');
  await expect(invalid.resolveAudioStoragePrefix(plan.account.userId)).rejects.toThrow();
  expect(await state.get(identityAudioAssignmentKey(plan.account.userId))).toBeNull();
});
