// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createIdentityStorage,
  IdentityStorageUnavailableError,
} from '~/server/repositories/identity/availability';
import type { IdentityRepository, RecordIdentityLogin } from '~/server/repositories/identity/types';
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
  'refuses %s before storage on failed availability and never caches a prior success',
  async (_name, invoke) => {
    const operation = vi.fn(async () => null);
    const repository = Object.fromEntries(
      Object.keys(calls).map((name) => [name, operation])
    ) as unknown as IdentityRepository;
    const connect = vi.fn(async () => true);
    const storage = createIdentityStorage(repository, connect);
    expect(await storage.ensureAvailable()).toBe(true);
    connect.mockResolvedValue(false);
    await expect(invoke(storage.repository)).rejects.toBeInstanceOf(
      IdentityStorageUnavailableError
    );
    expect(operation).not.toHaveBeenCalled();
    const cause = new Error('connection setup failed');
    connect.mockRejectedValue(cause);
    await expect(invoke(storage.repository)).rejects.toBe(cause);
    expect(operation).not.toHaveBeenCalled();
    // Only an explicitly successful later check permits this later operation.
    connect.mockResolvedValue(true);
    await invoke(storage.repository);
    expect(operation).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledTimes(4);
  }
);

it('captures login fields, dates and token fences before awaiting availability', async () => {
  let release!: (value: boolean) => void;
  const connect = () =>
    new Promise<boolean>((resolve) => {
      release = resolve;
    });
  const recordLogin = vi.fn(async () => ({ id: 'stored' }));
  const clearTokens = vi.fn(async () => 'cleared' as const);
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

it('propagates an uncertain write without a second availability check or automatic replay', async () => {
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
  expect(connect).toHaveBeenCalledOnce();
});

it('recognizes unavailable storage after serialization without including backend details', () => {
  const error = new IdentityStorageUnavailableError();
  expect(error.status).toBe(503);
  expect(isInfrastructureFailure(new Error(error.message))).toBe(true);
  expect(error.cause).toBeUndefined();
});
