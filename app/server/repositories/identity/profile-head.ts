import { createHash } from 'node:crypto';
import { z } from 'zod';
import { encodeState, newStateRevision, type StateKey } from '../../db/cql/control-state';
import type { ReservationStateStore } from './reservations';
import {
  parseProfile,
  profileObjectId,
  profileOperationId,
  profileSnapshotSchema,
  profileDigest,
  type ImmutableProfileStore,
} from './profile-model';
const commandSchema = z
  .object({
    operationId: profileOperationId,
    expectedRevision: profileOperationId.nullable(),
    snapshot: profileSnapshotSchema,
  })
  .strict();
export type PublishProfile = z.infer<typeof commandSchema>;
const base = {
  version: z.literal(1),
  operationId: profileOperationId,
  userId: profileObjectId,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
};
const journalSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('prepared'), command: commandSchema }).strict(),
  z.object({ ...base, status: z.literal('applied') }).strict(),
  z.object({ ...base, status: z.literal('rejected') }).strict(),
]);
const headSchema = z
  .object({
    version: z.literal(1),
    userId: profileObjectId,
    operationId: profileOperationId,
    snapshotId: profileObjectId,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export const profileHeadKey = (userId: string): StateKey => ({
  scope: `user:${parseProfile(profileObjectId, userId)}`,
  type: 'identity_profile_head',
  id: 'current',
});
export const profileOperationKey = (id: string): StateKey => ({
  scope: 'global',
  type: 'identity_profile_operation',
  id: parseProfile(profileOperationId, id),
});
const digest = (command: PublishProfile) =>
  createHash('sha256').update(JSON.stringify(command)).digest('hex');
type Outcome = 'applied' | 'rejected';

/** Trusted publication boundary, not an end-user profile mutation or authorization API. */
export function createIdentityProfiles(state: ReservationStateStore, graph: ImmutableProfileStore) {
  async function journal(id: string) {
    const row = await state.get(profileOperationKey(id));
    if (!row) throw new Error('Profile operation not found');
    const value = parseProfile(journalSchema, row.value);
    if (
      value.operationId !== id ||
      (value.status === 'prepared' &&
        (value.command.operationId !== id ||
          value.command.snapshot.userId !== value.userId ||
          digest(value.command) !== value.digest))
    )
      throw new Error('Profile journal mismatch');
    return { revision: row.revision, value };
  }
  async function head(userId: string) {
    const row = await state.get(profileHeadKey(userId));
    if (!row) return null;
    const value = parseProfile(headSchema, row.value);
    if (row.revision !== value.operationId || value.userId !== userId)
      throw new Error('Profile head mismatch');
    return { revision: row.revision, value };
  }
  async function receipt(id: string, outcome: Outcome): Promise<Outcome> {
    const current = await journal(id);
    if (current.value.status !== 'prepared') return current.value.status;
    const { command: _command, ...value } = current.value;
    const applied = await state.replace(
      profileOperationKey(id),
      current.revision,
      newStateRevision(),
      { ...value, status: outcome }
    );
    if (applied) return outcome;
    const raced = await journal(id);
    if (raced.value.status === 'prepared') throw new Error('Profile receipt did not settle');
    return raced.value.status;
  }
  async function requireReceipt(userId: string, operationId: string) {
    const saved = await journal(operationId);
    if (saved.value.userId !== userId || saved.value.status !== 'applied')
      throw new Error('Profile requires operation recovery');
  }
  return {
    async begin(input: PublishProfile) {
      const command = parseProfile(commandSchema, input);
      if (command.expectedRevision === command.operationId)
        throw new Error('Profile operation requires fresh revision');
      const value = {
        version: 1,
        operationId: command.operationId,
        userId: command.snapshot.userId,
        digest: digest(command),
        status: 'prepared',
        command,
      };
      encodeState(value);
      await state.create(profileOperationKey(command.operationId), newStateRevision(), value);
      const saved = await journal(command.operationId);
      if (saved.value.userId !== command.snapshot.userId || saved.value.digest !== value.digest)
        throw new Error('Profile operation ID reused');
      return saved.value.status;
    },
    async resume(id: string): Promise<Outcome> {
      const saved = await journal(id);
      if (saved.value.status !== 'prepared') return saved.value.status;
      const command = saved.value.command;
      const current = await head(command.snapshot.userId);
      if (current?.revision === id) return receipt(id, 'applied');
      if ((current?.revision ?? null) !== command.expectedRevision) return receipt(id, 'rejected');
      if (current) await requireReceipt(command.snapshot.userId, current.revision);
      await graph.put(command.snapshot);
      const stored = await graph.get(command.snapshot.userId, command.snapshot.snapshotId);
      if (!stored || profileDigest(stored) !== profileDigest(command.snapshot))
        throw new Error('Profile graph write not verified');
      const next = {
        version: 1,
        userId: command.snapshot.userId,
        operationId: id,
        snapshotId: command.snapshot.snapshotId,
        digest: profileDigest(stored),
      };
      const applied = current
        ? await state.replace(profileHeadKey(command.snapshot.userId), current.revision, id, next)
        : await state.create(profileHeadKey(command.snapshot.userId), id, next);
      if (applied) return receipt(id, 'applied');
      const raced = await head(command.snapshot.userId);
      return receipt(id, raced?.revision === id ? 'applied' : 'rejected');
    },
    async read(userId: string) {
      const current = await head(userId);
      if (!current) return null;
      await requireReceipt(userId, current.revision);
      const snapshot = await graph.get(userId, current.value.snapshotId);
      if (!snapshot || profileDigest(snapshot) !== current.value.digest)
        throw new Error('Published profile graph content missing or changed');
      return { revision: current.revision, snapshot };
    },
  };
}
