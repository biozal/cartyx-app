import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { encodeState, newStateRevision } from '../../db/cql/control-state';
import { accountLoginCommandSchema, createIdentityAccountState } from './account-state';
import { createIdentityProfiles, publishProfileSchema } from './profile-head';
import {
  parseProfile,
  profileObjectId,
  profileOperationId,
  profileSnapshotSchema,
  type ImmutableProfileStore,
} from './profile-model';
import { createIdentityReservations, type ReservationStateStore } from './reservations';
import type { IdentityProfile, IdentityRepository, RecordIdentityLogin } from './types';

const contentFields = profileSnapshotSchema.shape.content.shape;
// Enumerate login-owned fields; wider callers cannot change role, preferences or media.
const inputSchema = z.object({
  provider: accountLoginCommandSchema.shape.binding.shape.provider,
  providerId: accountLoginCommandSchema.shape.binding.shape.providerId,
  email: accountLoginCommandSchema.shape.email,
  oauthTokens: accountLoginCommandSchema.shape.tokens,
  firstName: contentFields.firstName.unwrap().optional(),
  lastName: contentFields.lastName.unwrap().optional(),
  avatarUrl: contentFields.avatarUrl.unwrap().optional(),
  lastLoginAt: z.date(),
});
const planSchema = z
  .object({
    version: z.literal(1),
    operationId: profileOperationId,
    selectedBy: z.enum(['new', 'provider', 'email']),
    reservationOperationId: profileOperationId,
    initializationOperationId: profileOperationId.nullable(),
    account: accountLoginCommandSchema,
    profile: publishProfileSchema,
  })
  .strict()
  .refine((plan) => plan.account.userId === plan.profile.snapshot.userId)
  .refine((plan) => plan.account.operationId !== plan.account.expectedRevision)
  .refine((plan) => plan.profile.operationId !== plan.profile.expectedRevision)
  .refine((plan) => {
    const ids = [
      plan.operationId,
      plan.reservationOperationId,
      plan.account.operationId,
      plan.profile.operationId,
    ];
    if (plan.initializationOperationId) ids.push(plan.initializationOperationId);
    return new Set(ids).size === ids.length;
  })
  .refine((plan) =>
    plan.selectedBy === 'new'
      ? plan.initializationOperationId === plan.account.expectedRevision &&
        plan.profile.expectedRevision === null
      : plan.initializationOperationId === null && plan.profile.expectedRevision !== null
  );
export type IdentityLoginPlan = z.infer<typeof planSchema>;
const receiptBase = {
  version: z.literal(1),
  operationId: profileOperationId,
  userId: profileObjectId,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
};
const journalSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptBase, status: z.literal('prepared'), plan: planSchema }).strict(),
  z.object({ ...receiptBase, status: z.literal('applied') }).strict(),
  z.object({ ...receiptBase, status: z.literal('rejected') }).strict(),
]);
type Outcome = 'applied' | 'rejected';
const digest = (plan: IdentityLoginPlan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');
function prepared(plan: IdentityLoginPlan) {
  return {
    version: 1 as const,
    operationId: plan.operationId,
    userId: plan.account.userId,
    digest: digest(plan),
    status: 'prepared' as const,
    plan,
  };
}
export function parseIdentityLoginPlan(input: unknown): IdentityLoginPlan {
  const plan = parseProfile(planSchema, input);
  encodeState(prepared(plan)); // Bound the full retained plan before any mutation.
  return plan;
}
export const identityLoginKey = (operationId: string) => ({
  scope: 'global',
  type: 'identity_login',
  id: parseProfile(profileOperationId, operationId),
});
export class IdentityLoginError extends Error {
  constructor(
    readonly operationId: string,
    readonly outcome: 'rejected' | 'uncertain' | 'superseded'
  ) {
    super('Identity login did not produce a current authenticated result');
    this.name = 'IdentityLoginError';
  }
}

/**
 * Inactive trusted OAuth coordination. Input must come from a newly verified
 * provider response. Recovery returns outcomes only, never a session/profile.
 */
export function createIdentityLoginCoordinator(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
) {
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  const reservations = createIdentityReservations(state);
  async function journal(id: string) {
    const row = await state.get(identityLoginKey(id));
    if (!row) throw new Error('Identity login operation not found');
    const value = parseProfile(journalSchema, row.value);
    if (
      value.operationId !== id ||
      (value.status === 'prepared' &&
        (value.plan.operationId !== id ||
          value.plan.account.userId !== value.userId ||
          digest(value.plan) !== value.digest))
    )
      throw new Error('Identity login journal mismatch');
    return { revision: row.revision, value };
  }
  async function finish(id: string, status: Outcome): Promise<Outcome> {
    const saved = await journal(id);
    if (saved.value.status !== 'prepared') return saved.value.status;
    const { plan: _plan, ...receipt } = saved.value;
    const applied = await state.replace(identityLoginKey(id), saved.revision, newStateRevision(), {
      ...receipt,
      status,
    });
    if (applied) return status;
    const raced = await journal(id);
    if (raced.value.status === 'prepared') throw new Error('Identity login receipt did not settle');
    return raced.value.status;
  }
  async function prepare(input: RecordIdentityLogin): Promise<IdentityLoginPlan> {
    const request = parseProfile(inputSchema, input); // Clone input before awaiting.
    const providerOwner = await reservations.findOwner({
      kind: 'provider_id',
      value: request.providerId,
    });
    let selectedBy: IdentityLoginPlan['selectedBy'] = providerOwner ? 'provider' : 'new';
    let owner = providerOwner;
    if (!owner && request.email) {
      owner = await reservations.findOwner({ kind: 'email', value: request.email });
      if (owner) selectedBy = 'email';
    }
    const account = owner ? await accounts.readAccount(owner) : null;
    if (
      owner &&
      (!account ||
        (selectedBy === 'provider'
          ? account.binding?.providerId !== request.providerId ||
            account.binding.provider !== request.provider
          : account.binding !== null || account.email !== request.email))
    )
      throw new Error('Identity login reservation cannot select this account');
    const profile = owner ? await profiles.read(owner) : null;
    if (owner && !profile) throw new Error('Identity login profile not published');
    if (owner && (await accounts.readAccount(owner))?.revision !== account?.revision)
      throw new Error('Identity login account changed during selection');
    const userId = owner ?? randomBytes(12).toString('hex');
    const initializationOperationId = owner ? null : newStateRevision();
    const timestamp = request.lastLoginAt.toISOString();
    return parseIdentityLoginPlan({
      version: 1,
      operationId: newStateRevision(),
      selectedBy,
      reservationOperationId: newStateRevision(),
      initializationOperationId,
      account: {
        kind: 'login',
        userId,
        operationId: newStateRevision(),
        expectedRevision: account?.revision ?? initializationOperationId,
        binding: { provider: request.provider, providerId: request.providerId },
        ...(request.email !== undefined && { email: request.email }),
        tokens: request.oauthTokens,
      },
      profile: {
        operationId: newStateRevision(),
        expectedRevision: profile?.revision ?? null,
        snapshot: {
          userId,
          snapshotId: randomBytes(12).toString('hex'),
          content: {
            ...(profile?.snapshot.content ?? {
              firstName: null,
              lastName: null,
              avatarUrl: null,
              role: 'unknown',
              rulerColor: null,
              createdAt: timestamp,
              lastLoginAt: null,
            }),
            ...(request.firstName !== undefined && { firstName: request.firstName }),
            ...(request.lastName !== undefined && { lastName: request.lastName }),
            ...(request.avatarUrl !== undefined && { avatarUrl: request.avatarUrl }),
            lastLoginAt: timestamp,
          },
        },
      },
    });
  }
  async function begin(input: IdentityLoginPlan) {
    const plan = parseIdentityLoginPlan(input);
    const value = prepared(plan);
    await state.create(identityLoginKey(plan.operationId), newStateRevision(), value);
    const saved = await journal(plan.operationId);
    if (saved.value.userId !== value.userId || saved.value.digest !== value.digest)
      throw new Error('Identity login operation ID reused');
    return saved.value.status;
  }
  async function resume(id: string): Promise<Outcome> {
    const saved = await journal(id);
    if (saved.value.status !== 'prepared') return saved.value.status;
    const plan = saved.value.plan;
    await reservations.begin({
      operationId: plan.reservationOperationId,
      userId: plan.account.userId,
      claims: [
        { kind: 'provider_id', value: plan.account.binding.providerId },
        ...(plan.account.email ? [{ kind: 'email' as const, value: plan.account.email }] : []),
      ],
    });
    if ((await reservations.resume(plan.reservationOperationId)) !== 'reserved')
      return finish(id, 'rejected');
    if (plan.initializationOperationId) {
      await accounts.begin({
        kind: 'initialize',
        operationId: plan.initializationOperationId,
        userId: plan.account.userId,
        email: plan.account.email ?? null,
        audioStoragePrefix: null,
      });
      if ((await accounts.resume(plan.initializationOperationId)) !== 'applied')
        return finish(id, 'rejected');
    }
    await profiles.begin(plan.profile);
    if ((await profiles.resume(plan.profile.operationId)) !== 'applied')
      return finish(id, 'rejected');
    await accounts.begin(plan.account);
    if ((await accounts.resume(plan.account.operationId)) !== 'applied')
      return finish(id, 'rejected');
    return finish(id, 'applied'); // Historical component outcomes, not session authorization.
  }
  async function currentResult(plan: IdentityLoginPlan): Promise<IdentityProfile> {
    // Equal, non-reusable account revisions bracket the profile read, establishing
    // a consistent observed result. A historical receipt alone is insufficient.
    const before = await accounts.readTokens(plan.account.userId);
    const profile = await profiles.read(plan.account.userId);
    const after = await accounts.readAccount(plan.account.userId);
    if (
      !before ||
      !after ||
      !profile ||
      before.revision !== after.revision ||
      before.tokenRevision !== plan.account.operationId ||
      after.tokenRevision !== plan.account.operationId ||
      !isDeepStrictEqual(after.binding, plan.account.binding) ||
      !isDeepStrictEqual(before.tokens, plan.account.tokens) ||
      profile.revision !== plan.profile.operationId
    )
      throw new IdentityLoginError(plan.operationId, 'superseded');
    const { firstName, lastName, avatarUrl, role } = profile.snapshot.content;
    return { id: after.userId, email: after.email, firstName, lastName, avatarUrl, role };
  }
  return {
    prepare,
    begin,
    resume,
    async recordLogin(
      input: RecordIdentityLogin,
      assertAdmission?: () => Promise<void>
    ): Promise<IdentityProfile> {
      // Capture login input before admission introduces an asynchronous boundary.
      const request = parseProfile(inputSchema, input);
      // The caller retains admission from before OAuth authorization started.
      await assertAdmission?.();
      const plan = await prepare(request);
      try {
        await assertAdmission?.();
        await begin(plan);
        if ((await resume(plan.operationId)) !== 'applied')
          throw new IdentityLoginError(plan.operationId, 'rejected');
        const result = await currentResult(plan);
        await assertAdmission?.();
        return result;
      } catch (error) {
        if (error instanceof IdentityLoginError) throw error;
        throw new IdentityLoginError(plan.operationId, 'uncertain');
      }
    },
  };
}

export function createTargetIdentityLogin(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
): Pick<IdentityRepository, 'recordLogin'> {
  const coordinator = createIdentityLoginCoordinator(state, graph);
  return { recordLogin: (input) => coordinator.recordLogin(input) };
}
