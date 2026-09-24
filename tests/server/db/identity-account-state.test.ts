// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  createIdentityAccountState,
  type AccountCommand,
} from '~/server/repositories/identity/account-state';
import type { StateRecord } from '~/server/db/cql/control-state';
import type { ReservationStateStore } from '~/server/repositories/identity/reservations';
import { identityAccountStateContract } from '../../../scripts/identity/account-state-contract';
function memoryStore(): ReservationStateStore {
  const rows = new Map<string, StateRecord>();
  return {
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
}
it('fences account binding, stale tokens, and interrupted operations', async () => {
  await identityAccountStateContract(memoryStore());
});
it('refuses undeclared account fields, invalid token envelopes and revision reuse', async () => {
  const accounts = createIdentityAccountState(memoryStore());
  const base = { operationId: randomUUID(), userId: 'a'.repeat(24) };
  const login = {
    ...base,
    kind: 'login',
    expectedRevision: randomUUID(),
    binding: { provider: 'fixture', providerId: 'fixture_a' },
    tokens: { accessToken: null, refreshToken: null },
  };
  for (const input of [
    { ...base, kind: 'initialize', email: null, audioStoragePrefix: null, role: 'gm' },
    {
      ...login,
      tokens: {
        accessToken: { ciphertext: 'plaintext', iv: 'bad', authTag: 'bad' },
        refreshToken: null,
      },
    },
    { ...login, expectedRevision: base.operationId },
    { ...login, binding: { provider: 'fixture', providerId: '\ud800' } },
  ])
    await expect(accounts.begin(input as AccountCommand)).rejects.toThrow();
  await expect(accounts.resume(base.operationId)).rejects.toThrow('operation not found');
});

/**
 * A write commits the account row first and its receipt immediately after, so a reader
 * can land between the two and see a committed account whose receipt still says
 * `prepared`. That is an operation in flight, not an interrupted one, and a read must
 * not report it as requiring recovery — while a receipt that never settles still must.
 */
function storeHoldingReceipts(): ReservationStateStore & {
  releaseReceipts(): void;
  receiptReads(): number;
} {
  const inner = memoryStore();
  const held: (() => void)[] = [];
  let reads = 0;
  return {
    async get(key) {
      if (key.type === 'identity_account_operation') reads++;
      return inner.get(key);
    },
    receiptReads: () => reads,
    create: inner.create,
    async replace(key, expected, revision, value) {
      // Hold only the receipt's settling write; the account row commits as usual.
      if (key.type !== 'identity_account_operation')
        return inner.replace(key, expected, revision, value);
      return new Promise<boolean>((resolve) => {
        held.push(() => resolve(inner.replace(key, expected, revision, value)));
      });
    },
    releaseReceipts() {
      for (const release of held.splice(0)) release();
    },
  };
}

const initializeFor = (userId: string): AccountCommand => ({
  kind: 'initialize',
  operationId: randomUUID(),
  userId,
  email: null,
  audioStoragePrefix: null,
});

/** Resolves once the account row itself is committed, before its receipt settles. */
async function accountRowWritten(store: ReservationStateStore, userId: string) {
  await vi.waitFor(async () =>
    expect(
      await store.get({ scope: `user:${userId}`, type: 'identity_account', id: 'auth' })
    ).not.toBeNull()
  );
}

it('reads an account whose receipt is still in flight', async () => {
  const store = storeHoldingReceipts();
  const accounts = createIdentityAccountState(store);
  const userId = 'b'.repeat(24);
  const initialize = initializeFor(userId);
  await accounts.begin(initialize);

  const applying = accounts.resume(initialize.operationId);
  await accountRowWritten(store, userId);

  // Release only once the reader has actually seen the prepared receipt, so the test
  // exercises the window rather than racing past it.
  const readsBefore = store.receiptReads();
  const reading = accounts.readAccount(userId);
  await vi.waitFor(() => expect(store.receiptReads()).toBeGreaterThan(readsBefore));
  store.releaseReceipts();

  expect(await applying).toBe('applied');
  expect((await reading)?.userId).toBe(userId);
});

it('still refuses an account whose receipt never settles', async () => {
  const store = storeHoldingReceipts();
  const accounts = createIdentityAccountState(store);
  const userId = 'c'.repeat(24);
  const initialize = initializeFor(userId);
  await accounts.begin(initialize);

  void accounts.resume(initialize.operationId);
  await accountRowWritten(store, userId);

  // The receipt is never released: an interrupted write, which recovery must own.
  await expect(accounts.readAccount(userId)).rejects.toThrow(/requires operation recovery/);
});
