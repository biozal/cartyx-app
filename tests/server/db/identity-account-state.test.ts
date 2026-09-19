// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
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
