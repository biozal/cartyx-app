import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseIdentityImportPlan, type IdentityImportPlan } from './import-account';

export interface AccountFixtureOptions {
  /** A bound account has a provider binding, email and encrypted tokens. */
  bound?: boolean;
  /** Omit the audio namespace so allocation contracts can fill it. */
  audioStoragePrefix?: boolean;
}

const envelope = () => ({
  ciphertext: randomBytes(32).toString('base64'),
  iv: randomBytes(12).toString('base64'),
  authTag: randomBytes(16).toString('base64'),
});

/**
 * Synthetic account creation plan for contracts and restart witnesses. No data is
 * migrated from any source, so plans are built directly rather than mapped from BSON.
 */
export function accountPlanFixture(options: AccountFixtureOptions = {}): IdentityImportPlan {
  const { bound = true, audioStoragePrefix = true } = options;
  const userId = randomBytes(12).toString('hex');
  return parseIdentityImportPlan({
    version: 1,
    // Retained for plan identity only; there is no external source document.
    sourceSha256: createHash('sha256').update(`fixture:${userId}`).digest('hex'),
    reservationOperationId: randomUUID(),
    profileOperationId: randomUUID(),
    account: {
      kind: 'import',
      operationId: randomUUID(),
      userId,
      binding: bound ? { provider: 'fixture', providerId: `fixture_${userId}` } : null,
      // An unbound account keeps its exact email so email-claim login is exercised.
      email: `Exact+${userId}@Example.invalid`,
      audioStoragePrefix: audioStoragePrefix ? randomBytes(16).toString('hex') : null,
      tokens: bound ? { accessToken: envelope(), refreshToken: envelope() } : null,
    },
    snapshot: {
      userId,
      snapshotId: randomBytes(12).toString('hex'),
      content: {
        firstName: "Mira'); -- 🐉",
        lastName: null,
        avatarUrl: null,
        role: 'gm',
        rulerColor: '#aBc123',
        createdAt: '2020-01-02T03:04:05.006Z',
        lastLoginAt: '2026-09-13T12:00:00.007Z',
      },
    },
  });
}
