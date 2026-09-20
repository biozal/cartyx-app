import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  createRevocationAdmission,
  IdentityRevocationError,
} from '../../app/server/repositories/identity/revocation-admission';
import type { ReservationStateStore } from '../../app/server/repositories/identity/reservations';

const APPLICATION = { provider: 'google', clientId: 'contract-client' } as const;

const userId = () => randomBytes(12).toString('hex');
const fence = (id: string) => ({
  userId: id,
  providerId: `google-${id}`,
  tokenRevision: randomBytes(16).toString('hex'),
});

/**
 * Logging out revokes the provider grant, and an uncertain revocation must not leave
 * the account loginable. The barrier that guarantees this is per user: one stranded
 * logout used to close the whole provider domain for everyone.
 */
export async function revocationAdmissionContract(state: ReservationStateStore) {
  const admission = createRevocationAdmission(state, APPLICATION);

  // A row that does not exist is not open, so an unknown subject cannot be admitted
  // by guessing an id the store has never seen.
  await assert.rejects(admission.assertOpen(userId()), IdentityRevocationError);

  const user = userId();
  await admission.ensureRow(user);
  await admission.ensureRow(user); // Idempotent: a repeated first login is not an error.
  await admission.assertOpen(user);
  assert.equal((await admission.inspect(user)).status, 'open');

  // Logout closes this user's row and hands back the fence to dispatch under.
  const dispatching = fence(user);
  assert.deepEqual(await admission.beginRevocation(user, dispatching), dispatching);
  assert.equal((await admission.inspect(user)).status, 'revoking');
  await assert.rejects(admission.assertOpen(user), IdentityRevocationError);

  // Another user is unaffected. This is the whole point of the redesign.
  const other = userId();
  await admission.ensureRow(other);
  await admission.assertOpen(other);

  // Logging out twice dispatches once: the second call reports that it lost.
  assert.equal(await admission.beginRevocation(user, fence(user)), null);

  // A definitive provider outcome reopens the row, and the user can log in again.
  await admission.settle(user);
  await admission.assertOpen(user);
  assert.equal((await admission.inspect(user)).status, 'open');

  // An uncertain outcome strands this user until an operator resolves it. Nothing in
  // the serving path reopens a stranded row, including a later logout.
  await admission.beginRevocation(user, fence(user));
  await admission.strand(user);
  assert.equal((await admission.inspect(user)).status, 'blocked-unresolved');
  await assert.rejects(admission.assertOpen(user), IdentityRevocationError);
  await assert.rejects(admission.settle(user), IdentityRevocationError);
  await assert.rejects(admission.beginRevocation(user, fence(user)), IdentityRevocationError);

  // Only the operator path reopens it, and only from stranded.
  await admission.resolve(user);
  await admission.assertOpen(user);
  await assert.rejects(admission.resolve(user), IdentityRevocationError);

  // Settling or stranding a row that is open is a caller error, not a silent no-op.
  await assert.rejects(admission.settle(user), IdentityRevocationError);
  await assert.rejects(admission.strand(user), IdentityRevocationError);

  // A row written for one application is never read as another's: rotating a client
  // must not inherit the previous domain's state.
  const rotated = createRevocationAdmission(state, { ...APPLICATION, clientId: 'other-client' });
  await assert.rejects(rotated.assertOpen(user), IdentityRevocationError);

  // Errors carry no subject, client or driver text.
  const failure = await admission.assertOpen(userId()).catch((error: unknown) => error);
  assert.ok(failure instanceof IdentityRevocationError);
  for (const secret of [APPLICATION.clientId, user])
    assert.ok(!failure.message.includes(secret), 'the message names no identifier');
}
