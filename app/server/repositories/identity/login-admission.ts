import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { newStateRevision } from '../../db/cql/control-state';
import { parseProfile, profileOperationId, type ImmutableProfileStore } from './profile-model';
import {
  createIdentityProviderRevocations,
  parseProviderRevocationPlan,
  type ProviderRevocationPlan,
} from './provider-revocation';
import type { ReservationStateStore } from './reservations';
import { createIdentityLoginCoordinator } from './target-login';
import type { RecordIdentityLogin } from './types';

const identifier = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[a-zA-Z0-9._-]+$/);
const applicationSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('google'), clientId: identifier, projectId: identifier }).strict(),
  z.object({ provider: z.literal('github'), clientId: identifier }).strict(),
  z.object({ provider: z.literal('apple'), clientId: identifier }).strict(),
]);
export type IdentityAdmissionApplication = z.infer<typeof applicationSchema>;
const domainSchema = z
  .object({
    provider: z.enum(['google', 'github', 'apple']),
    id: identifier,
  })
  .strict();
const ticketSchema = z
  .object({
    version: z.literal(1),
    application: applicationSchema,
    revision: profileOperationId,
  })
  .strict();
export type IdentityAdmissionTicket = z.infer<typeof ticketSchema>;
const rowSchema = z.discriminatedUnion('status', [
  z.object({ version: z.literal(1), domain: domainSchema, status: z.literal('open') }).strict(),
  z.object({ version: z.literal(1), domain: domainSchema, status: z.literal('blocked') }).strict(),
]);

function domainFor(application: IdentityAdmissionApplication) {
  return {
    provider: application.provider,
    id: application.provider === 'google' ? application.projectId : application.clientId,
  };
}
export function identityLoginAdmissionKey(input: IdentityAdmissionApplication) {
  const application = parseProfile(applicationSchema, input);
  return {
    scope: 'global',
    type: 'identity_login_admission',
    id: createHash('sha256')
      .update(JSON.stringify(domainFor(application)))
      .digest('hex'),
  };
}
/** No driver errors, configuration identifiers, provider subjects or tokens in telemetry. */
export class IdentityLoginAdmissionError extends Error {
  constructor() {
    super('Identity login admission is unavailable or blocked');
    this.name = 'IdentityLoginAdmissionError';
  }
}

/**
 * INACTIVE, monotonic admission barrier. This does not cancel OAuth requests,
 * revoke existing sessions or prove external quiescence. There is no reopen API.
 * Google clients sharing a project must use the same store and exact project ID.
 */
export function createIdentityLoginAdmission(
  state: ReservationStateStore,
  input: IdentityAdmissionApplication
) {
  const application = parseProfile(applicationSchema, input);
  const domain = domainFor(application);
  const key = identityLoginAdmissionKey(application);
  async function read() {
    const row = await state.get(key);
    if (!row) throw new IdentityLoginAdmissionError(); // Missing never means open.
    const value = parseProfile(rowSchema, row.value);
    if (!isDeepStrictEqual(value.domain, domain)) throw new IdentityLoginAdmissionError();
    parseProfile(profileOperationId, row.revision);
    return { ...row, value };
  }
  async function sanitized<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new IdentityLoginAdmissionError();
    }
  }
  return {
    /** Operator bootstrap only, before any serving OAuth workers. Never reopens a row. */
    initialize: () =>
      sanitized(async () => {
        await state.create(key, newStateRevision(), { version: 1, domain, status: 'open' });
        if ((await read()).value.status !== 'open') throw new IdentityLoginAdmissionError();
      }),
    inspect: () => sanitized(async () => ({ status: (await read()).value.status })),
    /** Capture before redirect/authorization. Retain privately with the original OAuth state. */
    issue: (): Promise<IdentityAdmissionTicket> =>
      sanitized(async () => {
        const row = await read();
        if (row.value.status !== 'open') throw new IdentityLoginAdmissionError();
        return { version: 1, application: structuredClone(application), revision: row.revision };
      }),
    /** Check original ticket before exchange and around target login, never mint one in callback. */
    assert: (input: IdentityAdmissionTicket) =>
      sanitized(async () => {
        const ticket = parseProfile(ticketSchema, input);
        if (!isDeepStrictEqual(ticket.application, application))
          throw new IdentityLoginAdmissionError();
        const row = await read();
        if (row.value.status !== 'open' || row.revision !== ticket.revision)
          throw new IdentityLoginAdmissionError();
      }),
    /**
     * Close before retaining/dispatching external revocation. Recovery may repeat
     * this DB-only operation. A lost acknowledgement never authorizes HTTP.
     * Deliberately blocks the entire domain: subject is unknown before OAuth.
     */
    block: () =>
      sanitized(async () => {
        const row = await read();
        if (row.value.status === 'blocked') return;
        await state.replace(key, row.revision, newStateRevision(), {
          version: 1,
          domain,
          status: 'blocked',
        });
        if ((await read()).value.status !== 'blocked') throw new IdentityLoginAdmissionError();
      }),
  };
}

/** Private server facade; caller must authenticate and bind OAuth state/PKCE separately. */
export function createAdmissionBoundIdentityLogin(
  state: ReservationStateStore,
  graph: ImmutableProfileStore,
  input: IdentityAdmissionApplication
) {
  const application = parseProfile(applicationSchema, input);
  const admission = createIdentityLoginAdmission(state, application);
  const login = createIdentityLoginCoordinator(state, graph);
  return {
    async recordLogin(ticketInput: IdentityAdmissionTicket, input: RecordIdentityLogin) {
      // Clone before the first asynchronous read, including nested encrypted tokens.
      const request = structuredClone(input);
      const ticket = parseProfile(ticketSchema, ticketInput);
      if (request.provider !== application.provider) throw new IdentityLoginAdmissionError();
      return login.recordLogin(request, () => admission.assert(ticket));
    },
  };
}

/**
 * External Google/GitHub attempts close admission BEFORE creating their journal.
 * Apple ordinary logout remains local-only and must use the existing token clearer.
 * Historical outcomes and successful HTTP responses never reopen this barrier.
 */
export function createAdmissionBoundProviderRevocations(
  state: ReservationStateStore,
  input: IdentityAdmissionApplication
) {
  const application = parseProfile(applicationSchema, input);
  const admission = createIdentityLoginAdmission(state, application);
  const revocations = createIdentityProviderRevocations(state);
  function parse(input: ProviderRevocationPlan) {
    const plan = parseProviderRevocationPlan(input);
    if (
      application.provider === 'apple' ||
      plan.provider !== application.provider ||
      plan.clientId !== application.clientId
    )
      throw new IdentityLoginAdmissionError();
    return plan;
  }
  return {
    async begin(input: ProviderRevocationPlan) {
      const plan = parse(input);
      await admission.block();
      return revocations.begin(plan);
    },
    async dispatch(
      input: ProviderRevocationPlan,
      transport: Parameters<typeof revocations.dispatch>[1]
    ) {
      const plan = parse(input);
      await admission.block();
      // Validate the exact retained plan against the journal, including its digest.
      await revocations.begin(plan);
      return revocations.dispatch(plan.fence, transport);
    },
    // Recovery has no transport, admits no login, and cannot reopen the domain.
    async resume(input: ProviderRevocationPlan) {
      const plan = parse(input);
      await admission.block();
      await revocations.begin(plan);
      return revocations.resume(plan.fence);
    },
  };
}
