import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { encodeState, newStateRevision, type StateKey } from '../../db/cql/control-state';
import { accountLoginCommandSchema, createIdentityAccountState } from './account-state';
import { parseProfile, profileOperationId } from './profile-model';
import type { ReservationStateStore } from './reservations';
import { identityTokenFenceSchema } from './token-fence';
import { createIdentityTokenClearer } from './target-tokens';
import type { IdentityTokenFence } from './types';

const providerSchema = z.enum(['google', 'github', 'apple']);
const clientIdSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[a-zA-Z0-9._-]+$/);
const planSchema = z
  .object({
    version: z.literal(1),
    fence: identityTokenFenceSchema,
    provider: providerSchema,
    clientId: clientIdSchema,
    accessToken: accountLoginCommandSchema.shape.tokens.shape.accessToken.unwrap(),
    clearOperationId: profileOperationId,
  })
  .strict()
  .refine((plan) => plan.clearOperationId !== plan.fence.tokenRevision);
export type ProviderRevocationPlan = z.infer<typeof planSchema>;
export type IdentityOAuthProvider = z.infer<typeof providerSchema>;
const responseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('http'), status: z.number().int().min(100).max(599) }).strict(),
  z
    .object({ kind: z.literal('skipped'), reason: z.enum(['apple_logout', 'github_credentials']) })
    .strict(),
]);
export type ProviderRevocationResponse = z.infer<typeof responseSchema>;
const base = {
  version: z.literal(1),
  fence: identityTokenFenceSchema,
  provider: providerSchema,
  clientId: clientIdSchema,
  clearOperationId: profileOperationId,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
};
const journalSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('prepared'), plan: planSchema }).strict(),
  z.object({ ...base, status: z.literal('attempting') }).strict(),
  z.object({ ...base, status: z.literal('response'), response: responseSchema }).strict(),
  z
    .object({
      ...base,
      status: z.literal('settled'),
      response: responseSchema,
      localOutcome: z.enum(['cleared', 'stale']),
    })
    .strict(),
  z.object({ ...base, status: z.literal('stale') }).strict(),
]);
export const identityProviderRevocationKey = (input: IdentityTokenFence): StateKey => {
  const fence = parseProfile(identityTokenFenceSchema, input);
  return {
    scope: `user:${fence.userId}`,
    type: 'identity_provider_revocation',
    id: fence.tokenRevision,
  };
};
const digest = (plan: ProviderRevocationPlan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');
function receiptBase(plan: ProviderRevocationPlan) {
  const { version, fence, provider, clientId, clearOperationId } = plan;
  return { version, fence, provider, clientId, clearOperationId, digest: digest(plan) };
}

/** Sanitized recovery reference; never retain a transport error, URL or token in the cause. */
export class IdentityProviderRevocationError extends Error {
  constructor(readonly tokenRevision: string) {
    super('Identity provider revocation requires inspection or local recovery');
    this.name = 'IdentityProviderRevocationError';
  }
}

/**
 * INACTIVE: one dispatch opportunity per stored token generation, not a provider
 * grant lock. Runtime admission/quiescence must be solved before wiring this in.
 * dispatch is never recovery: only its definitive CAS winner may call transport.
 */
export function createIdentityProviderRevocations(state: ReservationStateStore) {
  const accounts = createIdentityAccountState(state);
  const clearer = createIdentityTokenClearer(state);
  async function journal(input: IdentityTokenFence) {
    const fence = parseProfile(identityTokenFenceSchema, input);
    const row = await state.get(identityProviderRevocationKey(fence));
    if (!row) throw new Error('Identity provider revocation not found');
    const value = parseProfile(journalSchema, row.value);
    if (
      !isDeepStrictEqual(value.fence, fence) ||
      (value.status === 'prepared' &&
        !isDeepStrictEqual(receiptBase(value.plan), {
          version: value.version,
          fence: value.fence,
          provider: value.provider,
          clientId: value.clientId,
          clearOperationId: value.clearOperationId,
          digest: value.digest,
        }))
    )
      throw new Error('Identity provider revocation journal mismatch');
    if (
      'response' in value &&
      value.response.kind === 'skipped' &&
      value.response.reason !==
        (value.provider === 'apple'
          ? 'apple_logout'
          : value.provider === 'github'
            ? 'github_credentials'
            : null)
    )
      throw new Error('Identity provider revocation response mismatch');
    return { revision: row.revision, value };
  }
  async function matches(plan: ProviderRevocationPlan) {
    const current = await accounts.readTokens(plan.fence.userId);
    const account = await accounts.readAccount(plan.fence.userId);
    return (
      current !== null &&
      account !== null &&
      current.revision === account.revision &&
      current.providerId === plan.fence.providerId &&
      current.tokenRevision === plan.fence.tokenRevision &&
      account.binding?.provider === plan.provider &&
      isDeepStrictEqual(current.tokens.accessToken, plan.accessToken)
    );
  }
  async function inspect(fence: IdentityTokenFence) {
    const { value } = await journal(fence);
    // No tokens, provider IDs, profile fields or session result in this projection.
    return {
      status: value.status,
      provider: value.provider,
      ...('response' in value ? { response: value.response } : {}),
      ...(value.status === 'settled' ? { localOutcome: value.localOutcome } : {}),
    };
  }
  return {
    /** Read-only. Retain this exact private plan before begin; remaking it is not recovery. */
    async prepare(input: IdentityTokenFence, clientId: string): Promise<ProviderRevocationPlan> {
      const fence = parseProfile(identityTokenFenceSchema, input);
      const application = parseProfile(clientIdSchema, clientId);
      const current = await accounts.readTokens(fence.userId);
      const account = await accounts.readAccount(fence.userId);
      if (
        !current?.tokens.accessToken ||
        !account ||
        current.revision !== account.revision ||
        current.providerId !== fence.providerId ||
        current.tokenRevision !== fence.tokenRevision
      )
        throw new Error('Identity provider revocation generation is not current');
      const plan = parseProfile(planSchema, {
        version: 1,
        fence,
        provider: account.binding?.provider,
        clientId: application,
        accessToken: current.tokens.accessToken,
        clearOperationId: newStateRevision(),
      });
      encodeState({ ...receiptBase(plan), status: 'prepared', plan });
      return plan;
    },
    async begin(input: ProviderRevocationPlan) {
      const plan = parseProfile(planSchema, input);
      const value = { ...receiptBase(plan), status: 'prepared', plan };
      encodeState(value);
      await state.create(identityProviderRevocationKey(plan.fence), newStateRevision(), value);
      const saved = await journal(plan.fence);
      if (saved.value.digest !== digest(plan))
        throw new Error('Identity provider revocation generation reused');
      return inspect(plan.fence);
    },
    inspect,
    /**
     * Transport must issue at most one request, with redirects/retries disabled.
     * No caller can acquire this opportunity from an uncertain or false CAS result.
     */
    async dispatch(
      fence: IdentityTokenFence,
      transport: {
        provider: IdentityOAuthProvider;
        clientId: string;
        send: (plan: ProviderRevocationPlan) => Promise<ProviderRevocationResponse>;
      }
    ) {
      const parsed = parseProfile(identityTokenFenceSchema, fence);
      try {
        const saved = await journal(parsed);
        if (
          saved.value.provider !== transport.provider ||
          saved.value.clientId !== transport.clientId
        )
          throw new Error('Identity provider revocation application mismatch');
        if (saved.value.status !== 'prepared') return await inspect(parsed);
        const plan = saved.value.plan;
        const current = await matches(plan);
        const claimed = await state.replace(
          identityProviderRevocationKey(parsed),
          saved.revision,
          newStateRevision(),
          { ...receiptBase(plan), status: current ? 'attempting' : 'stale' }
        );
        if (!claimed || !current) return await inspect(parsed);
        // This check reduces stale dispatches; it is not atomic with external HTTP.
        const attempting = await journal(parsed);
        if (attempting.value.status !== 'attempting')
          throw new Error('Identity provider dispatch mismatch');
        if (!(await matches(plan))) {
          await state.replace(
            identityProviderRevocationKey(parsed),
            attempting.revision,
            newStateRevision(),
            { ...receiptBase(plan), status: 'stale' }
          );
          return await inspect(parsed);
        }
        const response = parseProfile(responseSchema, await transport.send(structuredClone(plan)));
        if (
          response.kind === 'skipped' &&
          response.reason !==
            (plan.provider === 'apple'
              ? 'apple_logout'
              : plan.provider === 'github'
                ? 'github_credentials'
                : null)
        )
          throw new Error('Identity provider response mismatch');
        const recorded = await state.replace(
          identityProviderRevocationKey(parsed),
          attempting.revision,
          newStateRevision(),
          { ...receiptBase(plan), status: 'response', response }
        );
        if (!recorded) throw new Error('Identity provider response did not settle');
        return await inspect(parsed);
      } catch {
        throw new IdentityProviderRevocationError(parsed.tokenRevision);
      }
    },
    /** Database-only recovery. An attempting journal is unresolved and never resends HTTP. */
    async resume(input: IdentityTokenFence) {
      const fence = parseProfile(identityTokenFenceSchema, input);
      try {
        const saved = await journal(fence);
        if (saved.value.status !== 'response') return await inspect(fence);
        await clearer.begin(saved.value.clearOperationId, fence);
        const localOutcome = await clearer.resume(saved.value.clearOperationId);
        await state.replace(
          identityProviderRevocationKey(fence),
          saved.revision,
          newStateRevision(),
          { ...saved.value, status: 'settled', localOutcome }
        );
        return await inspect(fence);
      } catch {
        throw new IdentityProviderRevocationError(fence.tokenRevision);
      }
    },
  };
}
