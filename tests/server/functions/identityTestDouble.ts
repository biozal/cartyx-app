import { vi } from 'vitest';
import { Campaign } from '~/server/db/models/Campaign';
import { createMongoCampaignAccessRepository } from '~/server/repositories/identity/mongo-campaign-access';
import type { IdentityProfile, IdentityRepository } from '~/server/repositories/identity/types';

/** Well-formed, so the real prefix validation runs rather than being bypassed. */
const MINTED_PREFIX = 'f'.repeat(32);

type DisplayName = { firstName?: string | null; lastName?: string | null; email?: string | null };

/**
 * Identity moved to the graph, so a server-function test can no longer set up its actor
 * by mocking `User.findOne`. It stands in for the whole identity module instead, which
 * is also what the functions under test actually depend on: a profile for a session id,
 * not a Mongo document.
 *
 * Use it from a test file as:
 *
 *   vi.mock('~/server/repositories/identity', () => import('./identityTestDouble'));
 *
 * then set `identityDouble.profile` in `beforeEach`. Resetting is the caller's job, as
 * with every other mock here.
 */
export const identityDouble: {
  profile: IdentityProfile | null;
  userId: string | null;
  available: boolean;
  /** Set when the name being read belongs to someone other than the acting user. */
  displayName: DisplayName | null | undefined;
  /** The user's media namespace. Null means they have never been allocated one. */
  audioPrefix: string | null;
} = {
  profile: null,
  userId: null,
  available: true,
  displayName: undefined,
  audioPrefix: MINTED_PREFIX,
};

/**
 * Restores both the state and the default implementations. A test that overrode one of
 * the mocks would otherwise leak that override into the next test, which is how a
 * passing suite ends up asserting nothing.
 */
export function resetIdentityDouble(profile: IdentityProfile | null = null) {
  identityDouble.profile = profile;
  identityDouble.userId = null;
  identityDouble.available = true;
  identityDouble.displayName = undefined;
  identityDouble.audioPrefix = MINTED_PREFIX;
  for (const [name, implementation] of Object.entries(defaults)) {
    const mock = identityRepository[name as keyof typeof defaults];
    mock.mockReset();
    mock.mockImplementation(implementation as never);
  }
  ensureIdentityAvailable.mockReset();
  ensureIdentityAvailable.mockImplementation(async () => identityDouble.available);
}

const defaults: IdentityRepository = {
  findProfile: async () => identityDouble.profile,
  // Sessions carry a provider id; the functions resolve it to the stored user id.
  findUserId: async () => identityDouble.userId ?? identityDouble.profile?.id ?? null,
  readDisplayName: async () =>
    identityDouble.displayName !== undefined
      ? identityDouble.displayName
      : identityDouble.profile
        ? {
            firstName: identityDouble.profile.firstName,
            lastName: identityDouble.profile.lastName,
            email: identityDouble.profile.email,
          }
        : null,
  recordLogin: async () => identityDouble.profile as IdentityProfile,
  // Resolving allocates on first use; looking up never does.
  resolveAudioStoragePrefix: async () => identityDouble.audioPrefix ?? MINTED_PREFIX,
  lookupAudioStoragePrefix: async () => identityDouble.audioPrefix,
  readAccessToken: async () => null,
  clearTokens: async () => 'cleared' as const,
  readPreferences: async () => null,
  setRulerColor: async () => undefined,
};

export const identityRepository = {
  findProfile: vi.fn(defaults.findProfile),
  findUserId: vi.fn(defaults.findUserId),
  readDisplayName: vi.fn(defaults.readDisplayName),
  recordLogin: vi.fn(defaults.recordLogin),
  resolveAudioStoragePrefix: vi.fn(defaults.resolveAudioStoragePrefix),
  lookupAudioStoragePrefix: vi.fn(defaults.lookupAudioStoragePrefix),
  readAccessToken: vi.fn(defaults.readAccessToken),
  clearTokens: vi.fn(defaults.clearTokens),
  readPreferences: vi.fn(defaults.readPreferences),
  setRulerColor: vi.fn(defaults.setRulerColor),
};

export const ensureIdentityAvailable = vi.fn(async () => identityDouble.available);

// Campaigns are still MongoDB and still read through the real adapter, so a test that
// mocks the Campaign model keeps exactly the membership behaviour it had before.
export const campaignAccessRepository = createMongoCampaignAccessRepository(Campaign);
