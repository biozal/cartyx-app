import { campaigns } from '../campaigns';
import { createIdentityStorage } from './availability';
import { createGraphProfileStore } from './graph-profiles';
import { createRevocationAdmission } from './revocation-admission';
import { createTargetIdentityRepository } from './target-repository';
import type { CampaignAccessRepository, IdentityRepository } from './types';

// Deliberately fixed: no environment flag can activate a partial cutover, and nothing
// here falls back to another store. Identity is served by the graph and the control
// state, and campaign access reads the campaign document from the graph.
let storage: ReturnType<typeof createIdentityStorage> | undefined;
let listening = false;
async function identityStorage() {
  // Composed on first use, and imported on first use too: `data-runtime` validates its
  // credentials as it loads, so that a misconfigured deployment cannot start serving.
  // Importing a server function must not be what triggers that.
  if (!storage) {
    const { checkDataReadiness, getGraphClient, getStateStore, onDataClose } =
      await import('../../db/data-runtime');
    // Closing the clients (a script or test finishing) must not strand this composition
    // on a shut-down pool: forget it, and the next call composes afresh.
    if (!listening) {
      listening = true;
      onDataClose(() => {
        storage = undefined;
      });
    }
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

/**
 * The barrier that keeps a user's account closed while their provider grant is being
 * withdrawn. It is per client, because that is the scope each provider's revocation
 * actually has; a client with no configured id has no barrier to offer and says so
 * rather than inventing a domain.
 */
export async function revocationAdmissionFor(provider: string) {
  const clientId = {
    google: process.env.GOOGLE_CLIENT_ID,
    github: process.env.GITHUB_CLIENT_ID,
    apple: process.env.APPLE_CLIENT_ID,
  }[provider];
  if (!clientId?.trim()) return null;
  const { getStateStore } = await import('../../db/data-runtime');
  return createRevocationAdmission(getStateStore(), {
    provider: provider as 'google' | 'github' | 'apple',
    clientId: clientId.trim(),
  });
}

/** Membership authority for access checks: the campaign document itself. */
export const campaignAccessRepository: CampaignAccessRepository = {
  async findAccess(campaignId) {
    const campaign = await campaigns.get(campaignId);
    if (!campaign) return null;
    return {
      gameMasterId: campaign.gameMasterId,
      members: campaign.members.map((member) => ({ userId: member.userId, role: member.role })),
    };
  },
};
