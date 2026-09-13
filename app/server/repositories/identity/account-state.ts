import { createHash } from 'node:crypto';
import { z } from 'zod';
import { encodeState, newStateRevision, type StateKey } from '../../db/cql/control-state';
import { createIdentityReservations, type ReservationStateStore } from './reservations';

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const userId = z.string().regex(/^[0-9a-f]{24}$/);
const exact = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => Buffer.from(value).toString('utf8') === value);
const prefix = z.string().regex(/^[0-9a-f]{32}$/);
const base64 = (bytes?: number) =>
  z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => {
      const decoded = Buffer.from(value, 'base64');
      return (
        decoded.toString('base64') === value && (bytes === undefined || decoded.length === bytes)
      );
    });
const envelope = z.object({ ciphertext: base64(), iv: base64(12), authTag: base64(16) }).strict();
const tokens = z
  .object({ accessToken: envelope.nullable(), refreshToken: envelope.nullable() })
  .strict();
const binding = z.object({ provider: exact, providerId: exact }).strict();
const common = { operationId: uuid, userId };
export const accountLoginCommandSchema = z
  .object({
    ...common,
    kind: z.literal('login'),
    expectedRevision: uuid,
    binding,
    email: exact.optional(),
    tokens,
  })
  .strict();
/** Operator-only creation from a reviewed archive; never replaces an existing account. */
export const accountImportCommandSchema = z
  .object({
    ...common,
    kind: z.literal('import'),
    binding: binding.nullable(),
    email: exact.nullable(),
    audioStoragePrefix: prefix.nullable(),
    tokens: tokens.nullable(),
  })
  .strict()
  .refine((value) => value.binding !== null || value.tokens === null);
const commandSchema = z.discriminatedUnion('kind', [
  accountImportCommandSchema,
  z
    .object({
      ...common,
      kind: z.literal('assign_audio'),
      expectedRevision: uuid,
      audioStoragePrefix: prefix,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('initialize'),
      email: exact.nullable(),
      audioStoragePrefix: prefix.nullable(),
    })
    .strict(),
  accountLoginCommandSchema,
  z
    .object({
      ...common,
      kind: z.literal('logout'),
      expectedRevision: uuid,
      expectedTokenRevision: uuid,
      providerId: exact,
    })
    .strict(),
]);
export type AccountCommand = z.infer<typeof commandSchema>;
const accountSchema = z
  .object({
    version: z.literal(1),
    userId,
    lastOperationId: uuid,
    binding: binding.nullable(),
    email: exact.nullable(),
    audioStoragePrefix: prefix.nullable(),
    tokenRevision: uuid.nullable(),
    tokens: tokens.nullable(),
  })
  .strict();
type Account = z.infer<typeof accountSchema>;
const receiptBase = {
  version: z.literal(1),
  operationId: uuid,
  userId,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
};
const journalSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptBase, status: z.literal('prepared'), command: commandSchema }).strict(),
  z.object({ ...receiptBase, status: z.literal('applied') }).strict(),
  z.object({ ...receiptBase, status: z.literal('rejected') }).strict(),
]);
export type AccountOutcome = 'applied' | 'rejected';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid identity account record');
  return parsed.data;
}
function digest(command: AccountCommand) {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}
export const identityAccountKey = (id: string): StateKey => ({
  scope: `user:${parse(userId, id)}`,
  type: 'identity_account',
  id: 'auth',
});
export const identityAccountOperationKey = (id: string): StateKey => ({
  scope: 'global',
  type: 'identity_account_operation',
  id: parse(uuid, id),
});

/** Inactive authentication authority. No graph content, authorization, or provider HTTP side effects. */
export function createIdentityAccountState(store: ReservationStateStore) {
  const reservations = createIdentityReservations(store);
  async function journal(id: string) {
    const row = await store.get(identityAccountOperationKey(id));
    if (!row) throw new Error('Identity account operation not found');
    const value = parse(journalSchema, row.value);
    if (
      value.operationId !== id ||
      (value.status === 'prepared' &&
        (value.command.operationId !== id ||
          value.command.userId !== value.userId ||
          digest(value.command) !== value.digest))
    )
      throw new Error('Identity account journal mismatch');
    return { revision: row.revision, value };
  }
  async function rawAccount(id: string) {
    const row = await store.get(identityAccountKey(id));
    if (!row) return null;
    const value = parse(accountSchema, row.value);
    if (
      value.userId !== id ||
      value.lastOperationId !== row.revision ||
      (value.binding === null && (value.tokens !== null || value.tokenRevision !== null)) ||
      (value.binding !== null && value.tokenRevision === null)
    )
      throw new Error('Identity account state mismatch');
    return { revision: row.revision, value };
  }
  async function settled(id: string) {
    const row = await rawAccount(id);
    if (row) {
      const receipt = await journal(row.value.lastOperationId);
      if (receipt.value.userId !== id || receipt.value.status !== 'applied')
        throw new Error('Identity account requires operation recovery');
    }
    return row;
  }
  async function finish(id: string, outcome: AccountOutcome): Promise<AccountOutcome> {
    const current = await journal(id);
    if (current.value.status !== 'prepared') return current.value.status;
    const { command: _command, ...receipt } = current.value;
    // Terminal receipts keep the digest/outcome, not historical encrypted token copies.
    const applied = await store.replace(
      identityAccountOperationKey(id),
      current.revision,
      newStateRevision(),
      {
        ...receipt,
        status: outcome,
      }
    );
    if (applied) return outcome;
    const raced = await journal(id);
    if (raced.value.status === 'prepared')
      throw new Error('Identity account receipt did not settle');
    return raced.value.status;
  }
  async function checkClaims(account: Account) {
    if (account.binding)
      await reservations.assertOwner(account.userId, {
        kind: 'provider_id',
        value: account.binding.providerId,
      });
    if (account.email)
      await reservations.assertOwner(account.userId, { kind: 'email', value: account.email });
    if (account.audioStoragePrefix)
      await reservations.assertOwner(account.userId, {
        kind: 'audio_prefix',
        value: account.audioStoragePrefix,
      });
  }
  return {
    async begin(input: AccountCommand): Promise<'prepared' | AccountOutcome> {
      const command = parse(commandSchema, input); // Clone before awaiting caller-controlled state.
      if ('expectedRevision' in command && command.expectedRevision === command.operationId)
        throw new Error('Account operation requires a fresh revision');
      const value = {
        version: 1 as const,
        operationId: command.operationId,
        userId: command.userId,
        digest: digest(command),
        status: 'prepared' as const,
        command,
      };
      encodeState(value); // Enforce the CQL bound even with alternate test stores.
      await store.create(
        identityAccountOperationKey(command.operationId),
        newStateRevision(),
        value
      );
      const saved = await journal(command.operationId);
      if (saved.value.userId !== command.userId || saved.value.digest !== value.digest)
        throw new Error('Identity account operation ID reused');
      return saved.value.status;
    },
    async resume(id: string): Promise<AccountOutcome> {
      const saved = await journal(id);
      if (saved.value.status !== 'prepared') return saved.value.status;
      const command = saved.value.command;
      const current = await rawAccount(command.userId);
      if (current?.revision === id) return finish(id, 'applied');
      const expected =
        command.kind === 'initialize' || command.kind === 'import'
          ? null
          : command.expectedRevision;
      if ((current?.revision ?? null) !== expected) {
        // If this operation already committed and was superseded, its applied receipt
        // necessarily exists: later writers may advance only after that receipt.
        return finish(id, 'rejected');
      }
      if (current) {
        const previous = await journal(current.value.lastOperationId);
        if (previous.value.userId !== command.userId || previous.value.status !== 'applied')
          throw new Error('Identity account requires operation recovery');
      }
      let next: Account;
      if (command.kind === 'initialize' || command.kind === 'import') {
        next = {
          version: 1,
          userId: command.userId,
          lastOperationId: id,
          binding: command.kind === 'import' ? command.binding : null,
          email: command.email,
          audioStoragePrefix: command.audioStoragePrefix,
          tokenRevision: command.kind === 'import' && command.binding ? id : null,
          tokens: command.kind === 'import' ? command.tokens : null,
        };
      } else {
        if (!current) return finish(id, 'rejected');
        if (command.kind === 'login') {
          if (
            current.value.binding &&
            (current.value.binding.provider !== command.binding.provider ||
              current.value.binding.providerId !== command.binding.providerId)
          )
            return finish(id, 'rejected');
          next = {
            ...current.value,
            lastOperationId: id,
            binding: command.binding,
            email: command.email ?? current.value.email,
            tokenRevision: id,
            tokens: command.tokens,
          };
        } else if (command.kind === 'assign_audio') {
          if (current.value.audioStoragePrefix !== null) return finish(id, 'rejected');
          // This mutation never rotates tokens or changes identity/profile fields.
          next = {
            ...current.value,
            lastOperationId: id,
            audioStoragePrefix: command.audioStoragePrefix,
          };
        } else {
          if (
            current.value.binding?.providerId !== command.providerId ||
            current.value.tokenRevision !== command.expectedTokenRevision
          )
            return finish(id, 'rejected');
          next = { ...current.value, lastOperationId: id, tokenRevision: id, tokens: null };
        }
      }
      await checkClaims(next);
      encodeState(next);
      const applied = current
        ? await store.replace(identityAccountKey(command.userId), current.revision, id, next)
        : await store.create(identityAccountKey(command.userId), id, next);
      if (applied) return finish(id, 'applied');
      const raced = await rawAccount(command.userId);
      return finish(id, raced?.revision === id ? 'applied' : 'rejected');
    },
    async readAccount(id: string) {
      const row = await settled(id);
      if (!row) return null;
      // Explicit ordinary projection: no encrypted tokens or operation payloads.
      return {
        userId: row.value.userId,
        revision: row.revision,
        binding: row.value.binding,
        email: row.value.email,
        audioStoragePrefix: row.value.audioStoragePrefix,
        tokenRevision: row.value.tokenRevision,
      };
    },
    async readTokens(id: string) {
      const row = await settled(id);
      if (!row || !row.value.binding || !row.value.tokens || !row.value.tokenRevision) return null;
      return {
        userId: id,
        providerId: row.value.binding.providerId,
        revision: row.revision,
        tokenRevision: row.value.tokenRevision,
        tokens: row.value.tokens,
      };
    },
  };
}
