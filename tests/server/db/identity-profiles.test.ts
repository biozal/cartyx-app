// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.unmock('mongoose');
import {
  identitySettingsContract,
  settingsAccountFixture,
} from '../../../scripts/identity/settings-contract';
import { identityProviderRevocationContract } from '../../../scripts/identity/provider-revocation-contract';
import {
  createIdentityProviderRevocations,
  IdentityProviderRevocationError,
} from '~/server/repositories/identity/provider-revocation';
import { identityTokensContract } from '../../../scripts/identity/tokens-contract';
import { identityLoginContract, loginFixture } from '../../../scripts/identity/login-contract';
import {
  createIdentityLoginCoordinator,
  IdentityLoginError,
} from '~/server/repositories/identity/target-login';
import { createTargetIdentityTokens } from '~/server/repositories/identity/target-tokens';
import { accountPlanFixture } from '../../../scripts/identity/account-fixture';
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
it('rejects malformed revocation plans before storage', async () => {
  const touched = vi.fn(async () => {
    throw new Error('private driver details');
  });
  const state = { get: touched, create: touched, replace: touched };
  const plan = {
    version: 1 as const,
    provider: 'google' as const,
    clientId: 'fixture.client',
    fence: { userId: 'a'.repeat(24), providerId: 'fixture', tokenRevision: randomUUID() },
    clearOperationId: randomUUID(),
    accessToken: loginFixture().oauthTokens.accessToken!,
  };
  const revocations = createIdentityProviderRevocations(state);
  for (const bad of [
    { ...plan, accessToken: null },
    {
      ...plan,
      fence: { ...plan.fence, providerId: '界'.repeat(1024) },
      clientId: 'x'.repeat(1024),
      accessToken: { ...plan.accessToken, ciphertext: Buffer.alloc(4096).toString('base64') },
    },
  ])
    await expect(revocations.begin(bad as never)).rejects.toThrow();
  expect(touched).not.toHaveBeenCalled();
});
it('retains provider attempt evidence and recovers local clearing without repeating HTTP', async () => {
  const { state, graph } = memory();
  await identityProviderRevocationContract(state, graph);
});
it('sanitizes failed final revocation reads while preserving response and clear receipts for recovery', async () => {
  const { state, graph } = memory();
  const login = createIdentityLoginCoordinator(state, graph);
  const loginPlan = await login.prepare({ ...loginFixture(), provider: 'google' });
  await login.begin(loginPlan);
  await login.resume(loginPlan.operationId);
  const fence = {
    userId: loginPlan.account.userId,
    providerId: loginPlan.account.binding.providerId,
    tokenRevision: loginPlan.account.operationId,
  };
  const revocations = createIdentityProviderRevocations(state);
  const plan = await revocations.prepare(fence, 'fixture.client');
  await revocations.begin(plan);
  const interrupted = (faultAt: number) => {
    let reads = 0;
    return createIdentityProviderRevocations({
      ...state,
      get: async (key) => {
        if (key.type === 'identity_provider_revocation' && ++reads === faultAt)
          throw new Error('private driver comparison');
        return state.get(key);
      },
    });
  };
  const send = vi.fn(async () => ({ kind: 'http' as const, status: 200 }));
  await expect(interrupted(3).dispatch(fence, { ...plan, send })).rejects.toEqual(
    new IdentityProviderRevocationError(fence.tokenRevision)
  );
  expect((await revocations.inspect(fence)).status).toBe('response');
  await expect(interrupted(2).resume(fence)).rejects.toEqual(
    new IdentityProviderRevocationError(fence.tokenRevision)
  );
  expect((await revocations.resume(fence)).localOutcome).toBe('cleared');
  await revocations.dispatch(fence, { ...plan, send });
  expect(send).toHaveBeenCalledTimes(1);
});
it('rejects malformed revocation plans and oversized token envelopes before touching storage', async () => {
  const touched = vi.fn(async () => {
    throw new Error('Unexpected storage call');
  });
  const revocations = createIdentityProviderRevocations({
    get: touched,
    create: touched,
    replace: touched,
  });
  const fence = {
    userId: '1'.repeat(24),
    providerId: 'fixture_provider',
    tokenRevision: randomUUID(),
  };
  const plan = {
    version: 1 as const,
    fence,
    provider: 'google' as const,
    clientId: 'fixture.client',
    clearOperationId: randomUUID(),
    accessToken: loginFixture().oauthTokens.accessToken!,
  };
  for (const invalid of [
    { ...plan, provider: 'unknown' },
    { ...plan, fence: { ...fence, providerId: { $ne: null } } },
    { ...plan, accessToken: null },
    { ...plan, clientId: 'invalid/path' },
    { ...plan, clearOperationId: fence.tokenRevision },
    { ...plan, plaintext: 'forbidden' },
    {
      ...plan,
      fence: { ...fence, providerId: '界'.repeat(1024) },
      clientId: 'x'.repeat(1024),
      accessToken: { ...plan.accessToken, ciphertext: Buffer.alloc(4096).toString('base64') },
    },
  ])
    await expect(revocations.begin(invalid as never)).rejects.toThrow();
  await expect(
    revocations.prepare({ ...fence, tokenRevision: 'invalid' }, plan.clientId)
  ).rejects.toThrow();
  await expect(revocations.prepare(fence, 'bad/client')).rejects.toThrow();
  expect(touched).not.toHaveBeenCalled();
});
it('coordinates target login selection and cross-store recovery without returning historical sessions', async () => {
  const { state, graph } = memory();
  await identityLoginContract(state, graph);
});
it('validates login input and complete plan bounds before persistence', async () => {
  const touched = vi.fn(async () => {
    throw new Error('Unexpected storage call');
  });
  const invalid = createIdentityLoginCoordinator(
    { get: touched, create: touched, replace: touched },
    { get: touched, put: touched }
  );
  for (const input of [
    { ...loginFixture(), providerId: { $ne: null } },
    { ...loginFixture(), oauthTokens: { accessToken: 'private', refreshToken: null } },
    { ...loginFixture(), firstName: '\ud800' },
    { ...loginFixture(), lastLoginAt: new Date('invalid') },
  ])
    await expect(invalid.prepare(input as never)).rejects.toThrow('Invalid identity');
  expect(touched).not.toHaveBeenCalled();
  const { state, graph } = memory();
  const plan = await createIdentityLoginCoordinator(state, graph).prepare(loginFixture());
  for (const bad of [
    { ...plan, profile: { ...plan.profile, expectedRevision: plan.profile.operationId } },
    { ...plan, initializationOperationId: null },
    {
      ...plan,
      profile: { ...plan.profile, snapshot: { ...plan.profile.snapshot, userId: '0'.repeat(24) } },
    },
    {
      ...plan,
      account: {
        ...plan.account,
        tokens: {
          accessToken: {
            ciphertext: Buffer.alloc(3072).toString('base64'),
            iv: Buffer.alloc(12).toString('base64'),
            authTag: Buffer.alloc(16).toString('base64'),
          },
          refreshToken: null,
        },
      },
      profile: {
        ...plan.profile,
        snapshot: {
          ...plan.profile.snapshot,
          content: {
            ...plan.profile.snapshot.content,
            firstName: '🐉'.repeat(512),
            lastName: '🐉'.repeat(512),
            avatarUrl: '🐉'.repeat(2048),
          },
        },
      },
    },
  ])
    await expect(invalid.begin(bad as never)).rejects.toThrow();
  expect(touched).not.toHaveBeenCalled();
});
it('stops uncertain login preparation without leaking the cause or retrying mutations', async () => {
  const { state, graph } = memory();
  const write = vi.fn(async () => {
    throw new Error('private token comparison');
  });
  const login = createIdentityLoginCoordinator(
    { get: (key) => state.get(key), create: write, replace: write },
    graph
  );
  let caught: unknown;
  try {
    await login.recordLogin(loginFixture());
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(IdentityLoginError);
  const failure = caught as IdentityLoginError;
  expect(failure.outcome).toBe('uncertain');
  expect(failure.operationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(failure.message).not.toContain('private');
  expect(write).toHaveBeenCalledTimes(1);
  await expect(login.resume(failure.operationId)).rejects.toThrow('not found');
});
it('fences token generations through concurrent login, media writes and clear recovery', async () => {
  const { state, graph } = memory();
  await identityTokensContract(state, graph);
});
it('refuses incomplete or query-shaped token fences before touching either backend', async () => {
  const touched = vi.fn(async () => {
    throw new Error('Backend must not be called');
  });
  const target = createTargetIdentityTokens({ get: touched, create: touched, replace: touched });
  const valid = { userId: '1'.repeat(24), providerId: 'fixture', tokenRevision: randomUUID() };
  for (const invalid of [
    'fixture',
    { ...valid, userId: { $ne: null } },
    { ...valid, providerId: { $ne: null } },
    { ...valid, tokenRevision: undefined },
    { ...valid, accessToken: 'private' },
  ])
    await expect(target.clearTokens(invalid as never)).rejects.toThrow('Invalid identity');
  expect(touched).not.toHaveBeenCalled();
});
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

it('reconciles an import completed by another worker during its initial empty-target check', async () => {
  const { state, graph } = memory();
  const plan = accountPlanFixture();
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
  const plan = settingsAccountFixture();
  await createIdentityImporter(state, graph).apply(plan);
  const invalid = createTargetIdentitySettings(state, graph, () => 'invalid');
  await expect(invalid.resolveAudioStoragePrefix(plan.account.userId)).rejects.toThrow();
  expect(await state.get(identityAudioAssignmentKey(plan.account.userId))).toBeNull();
});
