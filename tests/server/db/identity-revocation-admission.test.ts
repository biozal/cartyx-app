// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { revocationAdmissionContract } from '../../../scripts/identity/revocation-admission-contract';
import {
  createRevocationAdmission,
  identityRevocationKey,
  IdentityRevocationError,
} from '~/server/repositories/identity/revocation-admission';
import type { ReservationStateStore } from '~/server/repositories/identity/reservations';
import type { StateRecord } from '~/server/db/cql/control-state';

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

const application = { provider: 'google', clientId: 'test-client' } as const;
const user = 'a'.repeat(24);

it('admits, closes and reopens one user at a time', async () => {
  await revocationAdmissionContract(memoryStore());
});

it('refuses a row whose stored shape is wrong rather than reading it as open', async () => {
  const store = memoryStore();
  const admission = createRevocationAdmission(store, application);
  await admission.ensureRow(user);

  // A row missing its domain and subject could be another application's, or a
  // truncated write. Either way it is not evidence that this user may log in.
  const key = identityRevocationKey(application, user);
  const row = await store.get(key);
  await store.replace(key, row!.revision, 'r2', { version: 1, status: 'open' });
  await expect(admission.assertOpen(user)).rejects.toThrow(IdentityRevocationError);
});

it('refuses an identifier that is not a user id before it touches the store', async () => {
  const store = memoryStore();
  const admission = createRevocationAdmission(store, application);
  for (const invalid of ['', 'not-hex', 'A'.repeat(24), 'a'.repeat(23), 'a'.repeat(25)])
    await expect(admission.ensureRow(invalid)).rejects.toThrow(IdentityRevocationError);
});

it('refuses a malformed application before it touches the store', async () => {
  const touched = vi.fn(async () => {
    throw new Error('private driver details');
  });
  const store = { get: touched, create: touched, replace: touched };
  for (const invalid of [
    { provider: 'unsupported', clientId: 'fixture' },
    { provider: 'google', clientId: '../client' },
    { provider: 'google', clientId: '' },
    { provider: 'google', clientId: 'fixture', projectId: 'no longer part of the domain' },
  ])
    expect(() => createRevocationAdmission(store, invalid as never)).toThrow();
  expect(touched).not.toHaveBeenCalled();
});
