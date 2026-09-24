import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { newStateRevision } from '../../db/cql/control-state';
import { createIdentityAccountState } from './account-state';
import { parseProfile, profileObjectId, profileOperationId } from './profile-model';
import { createIdentityReservations, type ReservationStateStore } from './reservations';

const assignmentSchema = z
  .object({
    version: z.literal(1),
    userId: profileObjectId,
    prefix: z.string().regex(/^[0-9a-f]{32}$/),
    reservationOperationId: profileOperationId,
    accountOperationId: profileOperationId,
    expectedRevision: profileOperationId,
  })
  .strict()
  .refine((value) => value.accountOperationId !== value.expectedRevision);
export const identityAudioAssignmentKey = (userId: string) => ({
  scope: `user:${parseProfile(profileObjectId, userId)}`,
  type: 'identity_audio_assignment',
  id: 'prefix',
});

/** Inactive, server-only allocation. Resume uncertain work by calling resolve for the same user. */
export function createIdentityAudioAllocator(
  state: ReservationStateStore,
  mintPrefix = () => randomBytes(16).toString('hex')
) {
  const accounts = createIdentityAccountState(state);
  const reservations = createIdentityReservations(state);
  async function assignment(userId: string) {
    const row = await state.get(identityAudioAssignmentKey(userId));
    if (!row) return null;
    const value = parseProfile(assignmentSchema, row.value);
    if (value.userId !== userId) throw new Error('Audio assignment identity mismatch');
    return { revision: row.revision, value };
  }
  async function existingPrefix(userId: string, prefix: string) {
    await reservations.assertOwner(userId, { kind: 'audio_prefix', value: prefix });
    return prefix; // Only a settled account's namespace may escape this boundary.
  }
  return {
    async resolve(userId: string): Promise<string> {
      const key = identityAudioAssignmentKey(userId);
      // Read the intent first so a lost account receipt can be recovered on the next call.
      let saved = await assignment(userId);
      if (!saved) {
        const account = await accounts.readAccount(userId);
        if (!account) throw new Error('User not found');
        if (account.audioStoragePrefix) return existingPrefix(userId, account.audioStoragePrefix);
        const value = parseProfile(assignmentSchema, {
          version: 1,
          userId,
          prefix: mintPrefix(),
          reservationOperationId: newStateRevision(),
          accountOperationId: newStateRevision(),
          expectedRevision: account.revision,
        });
        await state.create(key, newStateRevision(), value);
        saved = await assignment(userId); // Racing uploads use the one persisted candidate.
        if (!saved) throw new Error('Audio assignment intent not persisted');
      }
      const { prefix, reservationOperationId } = saved.value;
      await reservations.begin({
        operationId: reservationOperationId,
        userId,
        claims: [{ kind: 'audio_prefix', value: prefix }],
      });
      if ((await reservations.resume(reservationOperationId)) !== 'reserved')
        throw new Error('Audio storage prefix belongs to another account');

      // Only a definitive rejected CAS permits a new attempt against a newer account
      // revision. Transport/receipt errors propagate immediately, retaining the intent.
      for (let attempt = 0; attempt < 3; attempt++) {
        await accounts.begin({
          kind: 'assign_audio',
          operationId: saved.value.accountOperationId,
          userId,
          expectedRevision: saved.value.expectedRevision,
          audioStoragePrefix: prefix,
        });
        const outcome = await accounts.resume(saved.value.accountOperationId);
        const account = await accounts.readAccount(userId);
        if (!account) throw new Error('User not found');
        if (account.audioStoragePrefix) return existingPrefix(userId, account.audioStoragePrefix);
        if (outcome === 'applied') throw new Error('Committed audio namespace is missing');
        if (account.revision === saved.value.expectedRevision)
          throw new Error('Audio assignment rejected without account advancement');
        if (attempt === 2) break;
        await state.replace(key, saved.revision, newStateRevision(), {
          ...saved.value,
          expectedRevision: account.revision,
          accountOperationId: newStateRevision(),
        });
        const next = await assignment(userId);
        if (
          !next ||
          next.value.prefix !== prefix ||
          next.value.reservationOperationId !== reservationOperationId
        )
          throw new Error('Audio assignment candidate changed');
        saved = next;
      }
      throw new Error('Audio assignment contended; resume for this user');
    },
  };
}
