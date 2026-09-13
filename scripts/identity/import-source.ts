import { createHash, randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { verifyArchive } from './archive';
import { parseIdentityImportPlan, type IdentityImportPlan } from './import-account';
const { BSON } = mongoose.mongo;
type Doc = Record<string, unknown>;
const object = (value: unknown): value is Doc =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
export class IdentityMappingError extends Error {
  constructor(readonly code: 'unmapped_fields' | 'source_shape' | 'target_shape_or_bound') {
    super('Identity source requires mapping review'); // Never include BSON values or Zod details.
  }
}
function requireSource(condition: unknown): asserts condition {
  if (!condition) throw new IdentityMappingError('source_shape');
}
function known(doc: Doc, fields: string[]) {
  if (Object.keys(doc).some((key) => !fields.includes(key)))
    throw new IdentityMappingError('unmapped_fields');
}
const timestamp = (value: unknown) => {
  if (value == null) return null;
  requireSource(value instanceof Date && Number.isFinite(value.getTime()));
  return value.toISOString();
};

/** Map a single original BSON frame, without defaults, token decryption or ID normalization. */
export function mapIdentitySource(input: Uint8Array): IdentityImportPlan {
  const raw = Buffer.from(input);
  let doc: Doc;
  try {
    requireSource(raw.length >= 5 && raw.length <= 16 * 1024 * 1024);
    requireSource(raw.readInt32LE(0) === raw.length);
    doc = BSON.deserialize(raw, { promoteValues: false, bsonRegExp: true });
    // Refuse lossy parsing, including duplicate field names. Conservative: unusual
    // BSON encodings that do not round-trip exactly require operator review too.
    requireSource(raw.equals(BSON.serialize(doc)));
  } catch {
    throw new IdentityMappingError('source_shape');
  }
  known(doc, [
    '_id',
    '__v',
    'email',
    'role',
    'provider',
    'providerId',
    'firstName',
    'lastName',
    'avatarUrl',
    'campaigns',
    'preferences',
    'oauthTokens',
    'audioStoragePrefix',
    'lastLoginAt',
    'createdAt',
    'updatedAt',
  ]);
  requireSource(doc._id instanceof BSON.ObjectId);
  // Sparse unique null values need a distinct policy; do not silently treat them as absent.
  for (const field of ['email', 'providerId', 'audioStoragePrefix'])
    requireSource(!Object.hasOwn(doc, field) || typeof doc[field] === 'string');
  requireSource((doc.providerId == null) === (doc.provider == null));
  if (doc.campaigns !== undefined) requireSource(Array.isArray(doc.campaigns));
  if (doc.__v !== undefined) requireSource(doc.__v instanceof BSON.Int32);
  let rulerColor: unknown = null;
  if (doc.preferences != null) {
    requireSource(object(doc.preferences));
    known(doc.preferences, ['rulerColor']);
    rulerColor = doc.preferences.rulerColor ?? null;
  }
  let tokens: unknown = null;
  if (doc.oauthTokens != null) {
    requireSource(object(doc.oauthTokens));
    known(doc.oauthTokens, ['revision', 'accessToken', 'refreshToken']);
    // Mongo fencing metadata is archive-preserved. Target import assigns its own
    // initial token revision; Mongo fences must never be usable against that target.
    if (Object.hasOwn(doc.oauthTokens, 'revision'))
      requireSource(
        typeof doc.oauthTokens.revision === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            doc.oauthTokens.revision
          ) &&
          doc.providerId != null
      );

    for (const field of ['accessToken', 'refreshToken']) {
      const envelope = doc.oauthTokens[field];
      if (envelope != null) {
        requireSource(object(envelope));
        known(envelope, ['ciphertext', 'iv', 'authTag']);
      }
    }
    tokens = {
      accessToken: doc.oauthTokens.accessToken ?? null,
      refreshToken: doc.oauthTokens.refreshToken ?? null,
    };
  }
  // Legacy metadata absent from the current User model. Kept in the original BSON,
  // alongside membership mirrors and __v; it is not a graph profile timestamp.
  timestamp(doc.updatedAt);
  const userId = doc._id.toHexString();
  const content = {
    firstName: doc.firstName ?? null,
    lastName: doc.lastName ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    role: doc.role ?? null,
    rulerColor,
    createdAt: timestamp(doc.createdAt),
    lastLoginAt: timestamp(doc.lastLoginAt),
  };
  try {
    return parseIdentityImportPlan({
      version: 1,
      sourceSha256: createHash('sha256').update(raw).digest('hex'),
      reservationOperationId: randomUUID(),
      profileOperationId: randomUUID(),
      account: {
        kind: 'import',
        operationId: randomUUID(),
        userId,
        binding:
          doc.providerId == null ? null : { provider: doc.provider, providerId: doc.providerId },
        email: doc.email ?? null,
        audioStoragePrefix: doc.audioStoragePrefix ?? null,
        tokens,
      },
      snapshot: { userId, snapshotId: randomBytes(12).toString('hex'), content },
    });
  } catch {
    throw new IdentityMappingError('target_shape_or_bound');
  }
}

/** Offline only. Plans and source values never leave this function or reach a database. */
export async function checkIdentityImportArchive(directory: string) {
  let mapped = 0;
  const blockers: Record<string, number> = {};
  const report = await verifyArchive(directory, (raw) => {
    try {
      mapIdentitySource(raw);
      mapped++;
    } catch (error) {
      if (!(error instanceof IdentityMappingError)) throw error;
      blockers[error.code] = (blockers[error.code] ?? 0) + 1;
    }
  });
  return {
    users: report.counts.users,
    mapped,
    blockers,
    sourceFindingCategories: Object.keys(report.findings).length,
    archiveOnlyFieldOccurrences: Object.fromEntries(
      ['campaigns', '__v', 'updatedAt', 'oauthTokens.revision'].map((field) => [
        field,
        report.fields
          .filter((entry) => entry.path[0] === 'users' && entry.path.slice(1).join('.') === field)
          .reduce((count, entry) => count + entry.occurrences, 0),
      ])
    ),
    // This checks only the supported projection. Original BSON remains mandatory
    // for null/missing, membership mirrors, __v and all source type information.
    cutoverReady: false as const,
  };
}
