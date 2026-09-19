// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { identityReservationContract } from '../../../scripts/identity/reservation-contract';
import {
  createIdentityReservations,
  type ReservationStateStore,
} from '~/server/repositories/identity/reservations';
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
it('preserves uniqueness and recovers every interrupted reservation write', async () => {
  await identityReservationContract(memoryStore());
});
it('rejects malformed or wider inputs before writing and omits identifiers from errors', async () => {
  const store = memoryStore();
  const reservations = createIdentityReservations(store);
  const input = {
    operationId: randomUUID(),
    userId: 'a'.repeat(24),
    claims: [{ kind: 'email', value: 'private@example.invalid' }],
  };
  for (const invalid of [
    { ...input, oauthTokens: 'forbidden' },
    { ...input, claims: [...input.claims, ...input.claims] },
    { ...input, claims: [{ kind: 'provider_id', value: '\ud800' }] },
    { ...input, claims: [{ kind: 'email', value: 'x'.repeat(1025) }] },
    { ...input, claims: [] },
    { ...input, userId: 'invalid' },
  ]) {
    await expect(reservations.begin(invalid as never)).rejects.toThrow(
      'Invalid identity reservation record'
    );
  }
  await expect(reservations.resume(input.operationId)).rejects.toThrow('operation not found');
});
