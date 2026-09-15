import { createIdentityAccountState } from './account-state';
import { createIdentityReservations, type ReservationStateStore } from './reservations';
import { createIdentityProfiles } from './profile-head';
import type { ImmutableProfileStore } from './profile-model';
import type { IdentityRepository } from './types';
export type TargetIdentityReader = Pick<
  IdentityRepository,
  'findProfile' | 'findUserId' | 'readDisplayName' | 'readPreferences' | 'lookupAudioStoragePrefix'
>;

/** Inactive read facet. No Mongo fallback, session issuance or implicit recovery writes. */
export function createTargetIdentityReader(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
): TargetIdentityReader {
  const reservations = createIdentityReservations(state);
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  async function byProvider(providerId: string) {
    const owner = await reservations.findOwner({ kind: 'provider_id', value: providerId });
    if (!owner) return null;
    const account = await accounts.readAccount(owner);
    // A stranded or merely prepared reservation cannot authenticate its claimed owner.
    if (!account || account.binding?.providerId !== providerId) return null;
    const profile = await profiles.read(owner);
    if (!profile) throw new Error('Identity graph profile not published');
    return { account, content: profile.snapshot.content };
  }
  return {
    async findProfile(providerId) {
      const found = await byProvider(providerId);
      return found
        ? {
            id: found.account.userId,
            email: found.account.email,
            firstName: found.content.firstName,
            lastName: found.content.lastName,
            avatarUrl: found.content.avatarUrl,
            role: found.content.role,
          }
        : null;
    },
    async findUserId(providerId) {
      return (await byProvider(providerId))?.account.userId ?? null;
    },
    async readDisplayName(userId) {
      const account = await accounts.readAccount(userId);
      if (!account) return null;
      const profile = await profiles.read(userId);
      if (!profile) throw new Error('Identity graph profile not published');
      return {
        firstName: profile.snapshot.content.firstName,
        lastName: profile.snapshot.content.lastName,
        email: account.email,
      };
    },
    async readPreferences(providerId) {
      const found = await byProvider(providerId);
      return found ? { rulerColor: found.content.rulerColor } : null;
    },
    async lookupAudioStoragePrefix(userId) {
      return (await accounts.readAccount(userId))?.audioStoragePrefix ?? null;
    },
  };
}
