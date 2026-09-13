import { createHash } from 'node:crypto';
import { z } from 'zod';
import { newStateRevision, type StateKey, type StateRecord } from '../../db/cql/control-state';

/** Trusted server/operator boundary. Reservations alone never authorize account access. */
export interface ReservationStateStore {
  get(key: StateKey): Promise<StateRecord | null>;
  create(key: StateKey, revision: string, value: unknown): Promise<boolean>;
  replace(key: StateKey, expected: string, revision: string, value: unknown): Promise<boolean>;
}
const objectId = z.string().regex(/^[0-9a-f]{24}$/);
const operationId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const exactString = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => Buffer.from(value).toString('utf8') === value);
const claimSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('provider_id'), value: exactString }).strict(),
  z.object({ kind: z.literal('email'), value: exactString }).strict(),
  z.object({ kind: z.literal('audio_prefix'), value: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
]);
const intentSchema = z
  .object({
    operationId,
    userId: objectId,
    claims: z.array(claimSchema).min(1).max(3),
  })
  .strict()
  .refine(({ claims }) => new Set(claims.map((claim) => claim.kind)).size === claims.length);
const journalSchema = z
  .object({
    version: z.literal(1),
    intent: intentSchema,
    status: z.enum(['preparing', 'reserved', 'conflict']),
  })
  .strict();
const reservationSchema = z
  .object({
    version: z.literal(1),
    userId: objectId,
    claim: claimSchema,
  })
  .strict();
export type IdentityReservationIntent = z.infer<typeof intentSchema>;
export type IdentityReservationClaim = z.infer<typeof claimSchema>;
export type IdentityReservationStatus = z.infer<typeof journalSchema>['status'];

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  // Never include stored identifiers, input values or schema error details in logs.
  if (!result.success) throw new Error('Invalid identity reservation record');
  return result.data;
}
function normalize(input: IdentityReservationIntent): IdentityReservationIntent {
  const intent = parse(intentSchema, input);
  intent.claims.sort((a, b) => a.kind.localeCompare(b.kind));
  return intent;
}
function journalKey(id: string): StateKey {
  return { scope: 'global', type: 'identity_reservation_operation', id: parse(operationId, id) };
}
export function identityReservationKey(input: IdentityReservationClaim): StateKey {
  const claim = parse(claimSchema, input);
  // Preserve exact casing/Unicode. The complete value is retained for collision detection.
  const id = createHash('sha256')
    .update(JSON.stringify([claim.kind, claim.value]))
    .digest('hex');
  return { scope: 'global', type: 'identity_reservation', id };
}
function sameIntent(left: IdentityReservationIntent, right: IdentityReservationIntent) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/**
 * Monotonic reservation preparation, deliberately not a complete login operation.
 * Claims never expire, change owners or get deleted here. Partial conflicts retain
 * earlier claims; safe release requires a future account-level fencing protocol.
 * Every uncertain write throws. The caller durably retains the operation ID and
 * explicitly resumes; no automatic write retry or graph mutation occurs here.
 */
export function createIdentityReservations(store: ReservationStateStore) {
  async function read(id: string) {
    const row = await store.get(journalKey(id));
    if (!row) throw new Error('Identity reservation operation not found');
    const journal = parse(journalSchema, row.value);
    if (journal.intent.operationId !== id) throw new Error('Identity reservation journal mismatch');
    return { revision: row.revision, ...journal };
  }
  async function owns(claim: IdentityReservationClaim, userId: string) {
    const row = await store.get(identityReservationKey(claim));
    if (!row) throw new Error('Identity reservation missing after write');
    const stored = parse(reservationSchema, row.value);
    if (stored.claim.kind !== claim.kind || stored.claim.value !== claim.value)
      throw new Error('Identity reservation key collision or corruption');
    return stored.userId === userId;
  }
  return {
    async assertOwner(userId: string, claim: IdentityReservationClaim): Promise<void> {
      if (!(await owns(parse(claimSchema, claim), parse(objectId, userId))))
        throw new Error('Identity identifier belongs to another account');
    },
    async begin(input: IdentityReservationIntent): Promise<IdentityReservationStatus> {
      const intent = normalize(input); // Snapshot caller-owned arrays before the first await.
      const key = journalKey(intent.operationId);
      await store.create(key, newStateRevision(), { version: 1, intent, status: 'preparing' });
      const journal = await read(intent.operationId);
      if (!sameIntent(journal.intent, intent))
        throw new Error('Identity reservation operation ID reused');
      return journal.status;
    },
    async resume(id: string): Promise<IdentityReservationStatus> {
      const journal = await read(id);
      if (journal.status === 'conflict') return 'conflict';
      let status: IdentityReservationStatus = 'reserved';
      for (const claim of normalize(journal.intent).claims) {
        if (journal.status === 'preparing') {
          await store.create(identityReservationKey(claim), newStateRevision(), {
            version: 1,
            userId: journal.intent.userId,
            claim,
          });
        }
        if (!(await owns(claim, journal.intent.userId))) {
          if (journal.status === 'reserved')
            throw new Error('Completed identity reservation changed owner');
          status = 'conflict';
          break;
        }
      }
      if (journal.status === 'reserved') return 'reserved';
      const applied = await store.replace(journalKey(id), journal.revision, newStateRevision(), {
        version: 1,
        intent: journal.intent,
        status,
      });
      if (!applied) {
        const current = await read(id);
        if (!sameIntent(current.intent, journal.intent) || current.status !== status)
          throw new Error('Identity reservation journal changed unexpectedly');
      }
      return status;
    },
  };
}
