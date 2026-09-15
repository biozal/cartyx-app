import { z } from 'zod';
import { newStateRevision } from '../../db/cql/control-state';
import { createIdentityAccountState } from './account-state';
import { parseProfile, profileOperationId } from './profile-model';
import { createIdentityReservations, type ReservationStateStore } from './reservations';
import { identityTokenFenceSchema, parseIdentityTokenFence } from './token-fence';
import type { IdentityRepository, IdentityTokenClearOutcome, IdentityTokenFence } from './types';

const base = {
  version: z.literal(1),
  operationId: profileOperationId,
  fence: identityTokenFenceSchema,
};
const journalSchema = z.discriminatedUnion('status', [
  z
    .object({
      ...base,
      status: z.literal('prepared'),
      attempt: z
        .object({ accountOperationId: profileOperationId, expectedRevision: profileOperationId })
        .strict()
        .refine((value) => value.accountOperationId !== value.expectedRevision)
        .nullable(),
    })
    .strict(),
  z.object({ ...base, status: z.literal('cleared') }).strict(),
  z.object({ ...base, status: z.literal('stale') }).strict(),
]);
export const identityTokenClearKey = (operationId: string) => ({
  scope: 'global',
  type: 'identity_token_clear',
  id: parseProfile(profileOperationId, operationId),
});

/** Recovery reference only. Never includes token, binding or user values in the message. */
export class IdentityTokenClearError extends Error {
  constructor(readonly operationId: string) {
    super('Identity token clear requires operation recovery');
    this.name = 'IdentityTokenClearError';
  }
}

/**
 * Inactive stored-token clearing protocol; it never sends provider HTTP requests.
 * Retain the operation ID and fence before begin, then explicitly resume uncertainty.
 */
export function createIdentityTokenClearer(state: ReservationStateStore) {
  const accounts = createIdentityAccountState(state);
  async function journal(id: string) {
    const row = await state.get(identityTokenClearKey(id));
    if (!row) throw new Error('Identity token clear operation not found');
    const value = parseProfile(journalSchema, row.value);
    if (value.operationId !== id) throw new Error('Identity token clear journal mismatch');
    return { revision: row.revision, value };
  }
  type Saved = Awaited<ReturnType<typeof journal>>;
  async function finish(saved: Saved, status: IdentityTokenClearOutcome) {
    const { operationId, fence } = saved.value;
    const applied = await state.replace(
      identityTokenClearKey(operationId),
      saved.revision,
      newStateRevision(),
      { version: 1, operationId, fence, status }
    );
    if (applied) return status;
    const raced = await journal(operationId);
    if (raced.value.status === 'prepared')
      throw new Error('Identity token clear receipt did not settle');
    return raced.value.status;
  }
  return {
    async begin(operationId: string, input: IdentityTokenFence) {
      const fence = parseIdentityTokenFence(input);
      const key = identityTokenClearKey(operationId);
      await state.create(key, newStateRevision(), {
        version: 1,
        operationId,
        fence,
        status: 'prepared',
        attempt: null,
      });
      const saved = await journal(operationId);
      if (JSON.stringify(saved.value.fence) !== JSON.stringify(fence))
        throw new Error('Identity token clear operation ID reused');
      return saved.value.status;
    },
    async resume(operationId: string): Promise<IdentityTokenClearOutcome> {
      let saved = await journal(operationId);
      for (let tries = 0; tries < 3; tries++) {
        if (saved.value.status !== 'prepared') return saved.value.status;
        const { fence } = saved.value;
        // Resume the retained command before reading the account, which may have
        // committed that command without its receipt. Never recover unrelated writes.
        if (saved.value.attempt) {
          await accounts.begin({
            kind: 'logout',
            operationId: saved.value.attempt.accountOperationId,
            userId: fence.userId,
            expectedRevision: saved.value.attempt.expectedRevision,
            expectedTokenRevision: fence.tokenRevision,
            providerId: fence.providerId,
          });
          const outcome = await accounts.resume(saved.value.attempt.accountOperationId);
          if (outcome === 'applied') return finish(saved, 'cleared');
        }
        const current = await accounts.readAccount(fence.userId);
        if (
          !current ||
          current.binding?.providerId !== fence.providerId ||
          current.tokenRevision !== fence.tokenRevision
        )
          return finish(saved, 'stale');
        // Only the initial read or a definitive rejected account receipt permits
        // a new command. The token generation remains fixed across all attempts.
        await state.replace(
          identityTokenClearKey(operationId),
          saved.revision,
          newStateRevision(),
          {
            ...saved.value,
            attempt: { accountOperationId: newStateRevision(), expectedRevision: current.revision },
          }
        );
        saved = await journal(operationId);
      }
      throw new Error('Identity token clear contended; resume operation');
    },
  };
}

export function createTargetIdentityTokens(
  state: ReservationStateStore
): Pick<IdentityRepository, 'readAccessToken' | 'clearTokens'> {
  const reservations = createIdentityReservations(state);
  const accounts = createIdentityAccountState(state);
  const clearer = createIdentityTokenClearer(state);
  return {
    async readAccessToken(providerId) {
      const userId = await reservations.findOwner({ kind: 'provider_id', value: providerId });
      if (!userId) return null;
      const current = await accounts.readTokens(userId);
      if (!current || current.providerId !== providerId || !current.tokens.accessToken) return null;
      return {
        userId,
        providerId,
        tokenRevision: current.tokenRevision,
        accessToken: current.tokens.accessToken,
      };
    },
    async clearTokens(input) {
      const fence = parseIdentityTokenFence(input);
      const operationId = newStateRevision();
      try {
        await clearer.begin(operationId, fence);
        return await clearer.resume(operationId);
      } catch {
        throw new IdentityTokenClearError(operationId);
      }
    },
  };
}
