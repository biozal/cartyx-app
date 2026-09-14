import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { encodeState, newStateRevision } from '../../app/server/db/cql/control-state';
import {
  accountImportCommandSchema,
  createIdentityAccountState,
  identityAccountKey,
} from '../../app/server/repositories/identity/account-state';
import {
  createIdentityReservations,
  type IdentityReservationClaim,
  type ReservationStateStore,
} from '../../app/server/repositories/identity/reservations';
import {
  createIdentityProfiles,
  profileHeadKey,
} from '../../app/server/repositories/identity/profile-head';
import {
  parseProfile,
  profileObjectId,
  profileOperationId,
  profileSnapshotSchema,
  type ImmutableProfileStore,
} from '../../app/server/repositories/identity/profile-model';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const planSchema = z
  .object({
    version: z.literal(1),
    sourceSha256: hash,
    reservationOperationId: profileOperationId,
    profileOperationId,
    account: accountImportCommandSchema,
    snapshot: profileSnapshotSchema,
  })
  .strict()
  .refine((plan) => plan.account.userId === plan.snapshot.userId)
  .refine(
    (plan) =>
      new Set([plan.account.operationId, plan.reservationOperationId, plan.profileOperationId])
        .size === 3
  );
export type IdentityImportPlan = z.infer<typeof planSchema>;
export type IdentityImportReceiptObservation =
  'missing' | 'prepared' | 'applied' | 'conflict' | 'unverified';
export type IdentityImportValueObservation = 'matching' | 'different' | 'unverified';
export interface IdentityImportObservation {
  receipt: IdentityImportReceiptObservation;
  reservations: IdentityImportValueObservation;
  account: IdentityImportValueObservation;
  profile: IdentityImportValueObservation;
}
export function parseIdentityImportPlan(input: unknown): IdentityImportPlan {
  const plan = parseProfile(planSchema, input);
  // Includes both subcommands plus receipt overhead. Reject bounds before any target write.
  encodeState({ plan, digest: '0'.repeat(64), status: 'prepared' });
  return plan;
}
export const identityImportKey = (userId: string) => ({
  scope: `user:${parseProfile(profileObjectId, userId)}`,
  type: 'identity_import',
  id: 'source',
});
const receiptSchema = z
  .object({
    version: z.literal(1),
    userId: profileObjectId,
    sourceSha256: hash,
    digest: hash,
    status: z.enum(['prepared', 'applied']),
  })
  .strict();
const digest = (plan: IdentityImportPlan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const matchesReceipt = (plan: IdentityImportPlan, value: z.infer<typeof receiptSchema>) =>
  value.userId === plan.account.userId &&
  value.sourceSha256 === plan.sourceSha256 &&
  value.digest === digest(plan);
const claimsFor = ({ account }: IdentityImportPlan): IdentityReservationClaim[] => [
  ...(account.binding ? [{ kind: 'provider_id' as const, value: account.binding.providerId }] : []),
  ...(account.email ? [{ kind: 'email' as const, value: account.email }] : []),
  ...(account.audioStoragePrefix
    ? [{ kind: 'audio_prefix' as const, value: account.audioStoragePrefix }]
    : []),
];

/**
 * Inactive operator import, for a quiescent target. The caller must durably retain
 * the exact reviewed plan AND original BSON before apply. Resume with that same
 * plan after an uncertain write. No retries, source writes, deletes or rebase.
 */
export function createIdentityImporter(state: ReservationStateStore, graph: ImmutableProfileStore) {
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  const reservations = createIdentityReservations(state);
  async function receipt(plan: IdentityImportPlan) {
    const row = await state.get(identityImportKey(plan.account.userId));
    if (!row) return null;
    const value = parseProfile(receiptSchema, row.value);
    if (!matchesReceipt(plan, value)) throw new Error('Identity import source or plan changed');
    return { revision: row.revision, value };
  }
  async function matchingReservations(plan: IdentityImportPlan) {
    for (const claim of claimsFor(plan))
      if ((await reservations.findOwner(claim)) !== plan.account.userId) return false;
    return true;
  }
  async function matchingAccount(plan: IdentityImportPlan) {
    const account = await accounts.readAccount(plan.account.userId);
    const encrypted = await accounts.readTokens(plan.account.userId);
    return (
      isDeepStrictEqual(account, {
        userId: plan.account.userId,
        revision: plan.account.operationId,
        binding: plan.account.binding,
        email: plan.account.email,
        audioStoragePrefix: plan.account.audioStoragePrefix,
        tokenRevision: plan.account.binding ? plan.account.operationId : null,
      }) &&
      isDeepStrictEqual(
        encrypted,
        plan.account.binding && plan.account.tokens
          ? {
              userId: plan.account.userId,
              providerId: plan.account.binding.providerId,
              revision: plan.account.operationId,
              tokenRevision: plan.account.operationId,
              tokens: plan.account.tokens,
            }
          : null
      )
    );
  }
  async function matchingProfile(plan: IdentityImportPlan) {
    return isDeepStrictEqual(await profiles.read(plan.account.userId), {
      revision: plan.profileOperationId,
      snapshot: plan.snapshot,
    });
  }
  async function verify(plan: IdentityImportPlan) {
    if (
      !(await matchingReservations(plan)) ||
      !(await matchingAccount(plan)) ||
      !(await matchingProfile(plan))
    )
      throw new Error('Identity import target differs from plan');
  }
  return {
    /** Read-only observations, not recovery authorization or a consistent snapshot. */
    async inspect(input: IdentityImportPlan): Promise<IdentityImportObservation> {
      const plan = parseIdentityImportPlan(input);
      let saved: IdentityImportReceiptObservation;
      try {
        const row = await state.get(identityImportKey(plan.account.userId));
        if (!row) saved = 'missing';
        else {
          const value = parseProfile(receiptSchema, row.value);
          saved = matchesReceipt(plan, value) ? value.status : 'conflict';
        }
      } catch {
        saved = 'unverified';
      }
      const observe = async (
        check: () => Promise<boolean>
      ): Promise<IdentityImportValueObservation> => {
        try {
          return (await check()) ? 'matching' : 'different';
        } catch {
          // An unreadable, unsettled or malformed record is never reported as absent.
          return 'unverified';
        }
      };
      return {
        receipt: saved,
        reservations: await observe(() => matchingReservations(plan)),
        account: await observe(() => matchingAccount(plan)),
        profile: await observe(() => matchingProfile(plan)),
      };
    },
    async verify(input: IdentityImportPlan): Promise<void> {
      const plan = parseIdentityImportPlan(input);
      if ((await receipt(plan))?.value.status !== 'applied')
        throw new Error('Identity import requires recovery');
      await verify(plan);
    },
    async apply(input: IdentityImportPlan): Promise<void> {
      const plan = parseIdentityImportPlan(input); // Snapshot caller-owned values before awaiting.
      let saved = await receipt(plan);
      if (!saved) {
        // A pre-existing target is a conflict, even if its current fields happen to match.
        if (
          (await state.get(identityAccountKey(plan.account.userId))) ||
          (await state.get(profileHeadKey(plan.account.userId)))
        ) {
          // Another resumption of this exact plan may have progressed since the
          // first read. Reconcile its receipt before classifying an occupied target.
          saved = await receipt(plan);
          if (!saved) throw new Error('Identity import requires an empty target account');
        }
        if (!saved)
          await state.create(identityImportKey(plan.account.userId), newStateRevision(), {
            version: 1,
            userId: plan.account.userId,
            sourceSha256: plan.sourceSha256,
            digest: digest(plan),
            status: 'prepared',
          });
        saved = await receipt(plan);
        if (!saved) throw new Error('Identity import intent not persisted');
      }
      if (saved.value.status === 'prepared') {
        const claims = claimsFor(plan);
        if (claims.length) {
          await reservations.begin({
            operationId: plan.reservationOperationId,
            userId: plan.account.userId,
            claims,
          });
          if ((await reservations.resume(plan.reservationOperationId)) !== 'reserved')
            throw new Error('Identity import identifier conflict');
        }
        // Publish the verified graph before making the account binding visible.
        // This is ordered recovery, not a cross-store atomic transaction.
        await profiles.begin({
          operationId: plan.profileOperationId,
          expectedRevision: null,
          snapshot: plan.snapshot,
        });
        if ((await profiles.resume(plan.profileOperationId)) !== 'applied')
          throw new Error('Identity import profile conflict');
        await accounts.begin(plan.account);
        if ((await accounts.resume(plan.account.operationId)) !== 'applied')
          throw new Error('Identity import account conflict');
        await verify(plan);
        const applied = await state.replace(
          identityImportKey(plan.account.userId),
          saved.revision,
          newStateRevision(),
          { ...saved.value, status: 'applied' }
        );
        if (!applied && (await receipt(plan))?.value.status !== 'applied')
          throw new Error('Identity import receipt did not settle');
      }
      // Historical receipts never authorize restoring old tokens or selecting old profiles.
      await verify(plan);
    },
  };
}
