// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createIdentityStorage,
  IdentityStorageUnavailableError,
} from '~/server/repositories/identity/availability';
import type { IdentityRepository, RecordIdentityLogin } from '~/server/repositories/identity/types';
import { DataUnavailableError } from '~/server/db/data-unavailable';
import { GraphRequestError } from '~/server/db/graph/transport';
import { isInfrastructureFailure } from '~/utils/error-classification';

const login = (): RecordIdentityLogin => ({
  provider: 'fixture',
  providerId: 'fixture_subject',
  email: 'exact@example.invalid',
  oauthTokens: { accessToken: null, refreshToken: null },
  lastLoginAt: new Date('2026-09-14T00:00:00.000Z'),
});
const fence = { userId: '1'.repeat(24), providerId: 'fixture_subject', tokenRevision: 'original' };
const calls = {
  recordLogin: (repo: IdentityRepository) => repo.recordLogin(login()),
  findProfile: (repo: IdentityRepository) => repo.findProfile('fixture_subject'),
  findUserId: (repo: IdentityRepository) => repo.findUserId('fixture_subject'),
  readDisplayName: (repo: IdentityRepository) => repo.readDisplayName(fence.userId),
  resolveAudioStoragePrefix: (repo: IdentityRepository) =>
    repo.resolveAudioStoragePrefix(fence.userId),
  lookupAudioStoragePrefix: (repo: IdentityRepository) =>
    repo.lookupAudioStoragePrefix(fence.userId),
  readAccessToken: (repo: IdentityRepository) => repo.readAccessToken('fixture_subject'),
  clearTokens: (repo: IdentityRepository) => repo.clearTokens(fence),
  readPreferences: (repo: IdentityRepository) => repo.readPreferences('fixture_subject'),
  setRulerColor: (repo: IdentityRepository) => repo.setRulerColor('fixture_subject', '#abcdef'),
} satisfies Record<keyof IdentityRepository, (repo: IdentityRepository) => Promise<unknown>>;

it.each(Object.entries(calls))(
  'reports %s as unavailable only when the store could not be reached',
  async (_name, invoke) => {
    const operation = vi.fn(async () => null);
    const repository = Object.fromEntries(
      Object.keys(calls).map((name) => [name, operation])
    ) as unknown as IdentityRepository;
    const connect = vi.fn(async () => true);
    const storage = createIdentityStorage(repository, connect);
    expect(await storage.ensureAvailable()).toBe(true);

    // An unreachable store is an outage the caller should see as one.
    operation.mockRejectedValueOnce(new DataUnavailableError());
    await expect(invoke(storage.repository)).rejects.toBeInstanceOf(
      IdentityStorageUnavailableError
    );
    operation.mockRejectedValueOnce(new GraphRequestError('timeout'));
    await expect(invoke(storage.repository)).rejects.toBeInstanceOf(
      IdentityStorageUnavailableError
    );

    // A refused traversal is a fault in this code, and reporting it as an outage would
    // hide it. So is a lost race, which the caller must reconcile rather than retry.
    const refused = new GraphRequestError('failed');
    operation.mockRejectedValueOnce(refused);
    await expect(invoke(storage.repository)).rejects.toBe(refused);
    const contended = new GraphRequestError('conflict');
    operation.mockRejectedValueOnce(contended);
    await expect(invoke(storage.repository)).rejects.toBe(contended);

    // Operations are not preceded by a probe: the request itself is the check.
    await invoke(storage.repository);
    expect(connect).toHaveBeenCalledOnce();
  }
);

it('captures login fields, dates and token fences when the command is issued', async () => {
  let release!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const connect = async () => true;
  const recordLogin = vi.fn(async () => {
    await pending;
    return { id: 'stored' };
  });
  const clearTokens = vi.fn(async () => {
    await pending;
    return 'cleared' as const;
  });
  const delegate = Object.fromEntries(
    Object.keys(calls).map((name) => [name, vi.fn()])
  ) as unknown as IdentityRepository;
  delegate.recordLogin = recordLogin;
  delegate.clearTokens = clearTokens;
  const repository = createIdentityStorage(delegate, connect).repository;
  const input = login();
  const original = structuredClone(input);
  const pendingLogin = repository.recordLogin(input);
  input.providerId = 'substituted';
  input.lastLoginAt.setFullYear(2030);
  input.oauthTokens.accessToken = { ciphertext: 'changed', iv: 'changed', authTag: 'changed' };
  release(true);
  expect(await pendingLogin).toEqual({ id: 'stored' });
  expect(recordLogin).toHaveBeenCalledWith(original);
  const clearing = { ...fence };
  const pendingClear = repository.clearTokens(clearing);
  clearing.tokenRevision = 'later-login';
  release(true);
  await pendingClear;
  expect(clearTokens).toHaveBeenCalledWith(fence);
});

it('propagates an uncertain write without an availability check or automatic replay', async () => {
  const uncertain = new Error('write acknowledgement lost');
  const operation = vi.fn(async () => {
    throw uncertain;
  });
  const delegate = Object.fromEntries(
    Object.keys(calls).map((name) => [name, operation])
  ) as unknown as IdentityRepository;
  const connect = vi.fn(async () => true);
  const storage = createIdentityStorage(delegate, connect);
  await expect(storage.repository.recordLogin(login())).rejects.toBe(uncertain);
  expect(operation).toHaveBeenCalledOnce();
  expect(connect).not.toHaveBeenCalled();
});

it('recognizes unavailable storage after serialization without including backend details', () => {
  const error = new IdentityStorageUnavailableError();
  expect(error.status).toBe(503);
  expect(isInfrastructureFailure(new Error(error.message))).toBe(true);
  expect(error.cause).toBeUndefined();
});
