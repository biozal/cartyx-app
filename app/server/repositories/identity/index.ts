import { Campaign } from '../../db/models/Campaign';
import { createIdentityStorage } from './availability';
import { createGraphProfileStore } from './graph-profiles';
import { createMongoCampaignAccessRepository } from './mongo-campaign-access';
import { createTargetIdentityRepository } from './target-repository';
import type { IdentityRepository } from './types';

// Deliberately fixed: no environment flag can activate a partial cutover, and nothing
// here falls back to another store. Identity is served by the graph and the control
// state; campaign access is the last Mongo reader in this file and leaves with its own
// slice.
let storage: ReturnType<typeof createIdentityStorage> | undefined;
async function identityStorage() {
  // Composed on first use, and imported on first use too: `data-runtime` validates its
  // credentials as it loads, so that a misconfigured deployment cannot start serving.
  // Importing a server function must not be what triggers that.
  if (!storage) {
    const { checkDataReadiness, getGraphClient, getStateStore } =
      await import('../../db/data-runtime');
    storage = createIdentityStorage(
      createTargetIdentityRepository(getStateStore(), createGraphProfileStore(getGraphClient())),
      async () => {
        const readiness = await checkDataReadiness();
        return readiness.graph && readiness.cql;
      }
    );
  }
  return storage;
}

export const identityRepository: IdentityRepository = {
  recordLogin: async (input) => (await identityStorage()).repository.recordLogin(input),
  findProfile: async (providerId) => (await identityStorage()).repository.findProfile(providerId),
  findUserId: async (providerId) => (await identityStorage()).repository.findUserId(providerId),
  readDisplayName: async (userId) => (await identityStorage()).repository.readDisplayName(userId),
  resolveAudioStoragePrefix: async (userId) =>
    (await identityStorage()).repository.resolveAudioStoragePrefix(userId),
  lookupAudioStoragePrefix: async (userId) =>
    (await identityStorage()).repository.lookupAudioStoragePrefix(userId),
  readAccessToken: async (providerId) =>
    (await identityStorage()).repository.readAccessToken(providerId),
  clearTokens: async (fence) => (await identityStorage()).repository.clearTokens(fence),
  readPreferences: async (providerId) =>
    (await identityStorage()).repository.readPreferences(providerId),
  setRulerColor: async (providerId, rulerColor) =>
    (await identityStorage()).repository.setRulerColor(providerId, rulerColor),
};

/** Explicit caller decisions use the same selected adapter as operations. */
export const ensureIdentityAvailable = async () => (await identityStorage()).ensureAvailable();

export const campaignAccessRepository = createMongoCampaignAccessRepository(Campaign);
