import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { newStateRevision, type StateKey } from '../../db/cql/control-state';
import { parseProfile } from './profile-model';
import type { ReservationStateStore } from './reservations';
import type { IdentityTokenFence } from './types';

const identifier = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[a-zA-Z0-9._-]+$/);
const userIdSchema = z.string().regex(/^[0-9a-f]{24}$/);
const applicationSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('google'), clientId: identifier, projectId: identifier }).strict(),
  z.object({ provider: z.literal('github'), clientId: identifier }).strict(),
  z.object({ provider: z.literal('apple'), clientId: identifier }).strict(),
]);
export type IdentityRevocationApplication = z.infer<typeof applicationSchema>;

const domainSchema = z
  .object({ provider: z.enum(['google', 'github', 'apple']), id: identifier })
  .strict();
const fenceSchema = z
  .object({
    userId: userIdSchema,
    providerId: z.string().min(1).max(1024),
    tokenRevision: z.string().min(1).max(1024),
  })
  .strict();

export type RevocationStatus = 'open' | 'revoking' | 'blocked-unresolved';
const base = { version: z.literal(1), domain: domainSchema, userId: userIdSchema };
const rowSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('open') }).strict(),
  // The fence records which token generation the dispatched request belongs to, so a
  // recovery can tell whether it is looking at its own attempt or a newer login's.
  z.object({ ...base, status: z.literal('revoking'), fence: fenceSchema }).strict(),
  z.object({ ...base, status: z.literal('blocked-unresolved'), fence: fenceSchema }).strict(),
]);

/** Google clients that share a project share a domain; others are per client. */
function domainFor(application: IdentityRevocationApplication) {
  return {
    provider: application.provider,
    id: application.provider === 'google' ? application.projectId : application.clientId,
  };
}

export function identityRevocationKey(
  input: IdentityRevocationApplication,
  userId: string
): StateKey {
  const application = parseProfile(applicationSchema, input);
  return {
    scope: 'global',
    type: 'identity_revocation',
    id: createHash('sha256')
      .update(
        JSON.stringify({
          domain: domainFor(application),
          userId: parseProfile(userIdSchema, userId),
        })
      )
      .digest('hex'),
  };
}

/** No driver errors, configuration identifiers, provider subjects or tokens in telemetry. */
export class IdentityRevocationError extends Error {
  constructor() {
    super('Identity login is closed pending revocation');
    this.name = 'IdentityRevocationError';
  }
}

/**
 * A per-user barrier around provider revocation.
 *
 * Logging out revokes the grant at the provider, and a revocation whose outcome is
 * unknown must not leave the account loginable — otherwise a logout the user believes
 * succeeded silently did not. The row is therefore closed before the request is
 * dispatched and reopened only on a definitive outcome; an uncertain one strands the
 * row until an operator resolves it.
 *
 * Each row covers one user, so a stranded logout costs that account its next login and
 * nothing more. Rows are keyed by domain as well as user, so rotating a client cannot
 * inherit the previous domain's state.
 */
export function createRevocationAdmission(
  state: ReservationStateStore,
  input: IdentityRevocationApplication
) {
  const application = parseProfile(applicationSchema, input);
  const domain = domainFor(application);

  async function sanitized<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new IdentityRevocationError();
    }
  }

  async function read(userId: string) {
    const key = identityRevocationKey(application, userId);
    const row = await state.get(key);
    if (!row) throw new IdentityRevocationError(); // Missing never means open.
    const value = parseProfile(rowSchema, row.value);
    if (!isDeepStrictEqual(value.domain, domain) || value.userId !== userId)
      throw new IdentityRevocationError();
    return { key, revision: row.revision, value };
  }

  /** Every transition confirms its own result, so a lost write never reads as applied. */
  async function transition(
    userId: string,
    from: RevocationStatus[],
    next: (current: z.infer<typeof rowSchema>) => z.infer<typeof rowSchema>
  ) {
    const row = await read(userId);
    if (!from.includes(row.value.status)) throw new IdentityRevocationError();
    const value = parseProfile(rowSchema, next(row.value));
    await state.replace(row.key, row.revision, newStateRevision(), value);
    const confirmed = await read(userId);
    if (confirmed.value.status !== value.status) throw new IdentityRevocationError();
    return confirmed.value;
  }

  return {
    /** Idempotent: a repeated first login finds its own row and leaves it alone. */
    ensureRow: (userId: string) =>
      sanitized(async () => {
        const id = parseProfile(userIdSchema, userId);
        await state.create(identityRevocationKey(application, id), newStateRevision(), {
          version: 1,
          domain,
          userId: id,
          status: 'open',
        });
        await read(id);
      }),

    /** Callers must not mint a session when this rejects. */
    assertOpen: (userId: string) =>
      sanitized(async () => {
        if ((await read(parseProfile(userIdSchema, userId))).value.status !== 'open')
          throw new IdentityRevocationError();
      }),

    inspect: (userId: string): Promise<{ status: RevocationStatus }> =>
      sanitized(async () => ({
        status: (await read(parseProfile(userIdSchema, userId))).value.status,
      })),

    /**
     * Closes the row before anything is dispatched. Returns null when another attempt
     * already holds it, so a second logout does not send a second request.
     */
    beginRevocation: (userId: string, input: IdentityTokenFence) =>
      sanitized(async () => {
        const id = parseProfile(userIdSchema, userId);
        const fence = parseProfile(fenceSchema, input);
        if (fence.userId !== id) throw new IdentityRevocationError();
        const row = await read(id);
        if (row.value.status === 'revoking') return null;
        await transition(id, ['open'], (current) => ({ ...current, status: 'revoking', fence }));
        return fence;
      }),

    /** The provider answered definitively — success or definitive failure. */
    settle: (userId: string) =>
      sanitized(async () => {
        const id = parseProfile(userIdSchema, userId);
        await transition(id, ['revoking'], ({ domain, userId, version }) => ({
          version,
          domain,
          userId,
          status: 'open',
        }));
      }),

    /** The outcome is unknown: a timeout, or a response that never arrived. */
    strand: (userId: string) =>
      sanitized(async () => {
        const id = parseProfile(userIdSchema, userId);
        await transition(id, ['revoking'], (current) => {
          // `from` already established this; narrowing the union needs it in the body.
          if (current.status !== 'revoking') throw new IdentityRevocationError();
          return { ...current, status: 'blocked-unresolved' };
        });
      }),

    /**
     * Operator recovery, after checking the provider's own state. Nothing in the
     * serving path calls this, and it only reopens a row that is actually stranded.
     */
    resolve: (userId: string) =>
      sanitized(async () => {
        const id = parseProfile(userIdSchema, userId);
        await transition(id, ['blocked-unresolved'], ({ domain, userId, version }) => ({
          version,
          domain,
          userId,
          status: 'open',
        }));
      }),
  };
}

export type RevocationAdmission = ReturnType<typeof createRevocationAdmission>;
