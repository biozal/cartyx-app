import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createIdentityAccountState } from './account-state';
import { createIdentityAudioAllocator } from './audio-prefix';
import { createIdentityProfiles } from './profile-head';
import { parseProfile, type ImmutableProfileStore } from './profile-model';
import { createIdentityReservations, type ReservationStateStore } from './reservations';
import type { IdentityRepository } from './types';

/** Server/operator recovery reference only; contains no profile, token or media values. */
export class IdentityPreferenceWriteError extends Error {
  constructor(
    readonly operationId: string,
    readonly outcome: 'rejected' | 'uncertain'
  ) {
    super(
      outcome === 'rejected'
        ? 'Identity preference changed concurrently'
        : 'Identity preference requires operation recovery'
    );
    this.name = 'IdentityPreferenceWriteError';
  }
}

/** Inactive runtime write facet. Callers authenticate/authorize before using it. */
export function createTargetIdentitySettings(
  state: ReservationStateStore,
  graph: ImmutableProfileStore,
  mintAudioPrefix?: () => string
): Pick<IdentityRepository, 'setRulerColor' | 'resolveAudioStoragePrefix'> {
  const reservations = createIdentityReservations(state);
  const accounts = createIdentityAccountState(state);
  const profiles = createIdentityProfiles(state, graph);
  const audio = createIdentityAudioAllocator(state, mintAudioPrefix);
  return {
    resolveAudioStoragePrefix: (userId) => audio.resolve(userId),
    async setRulerColor(providerId, input) {
      const rulerColor = parseProfile(z.string().regex(/^#[0-9a-fA-F]{6}$/), input);
      const userId = await reservations.findOwner({ kind: 'provider_id', value: providerId });
      if (!userId) return;
      const account = await accounts.readAccount(userId);
      if (!account || account.binding?.providerId !== providerId) return;
      const current = await profiles.read(userId);
      if (!current) throw new Error('Identity graph profile not published');
      const operationId = randomUUID();
      // Only this field may be edited; preserve every other field from verified content.
      // A competing profile/login update causes rejection, never an implicit stale merge.
      let outcome: 'applied' | 'rejected';
      try {
        await profiles.begin({
          operationId,
          expectedRevision: current.revision,
          snapshot: {
            userId,
            snapshotId: randomBytes(12).toString('hex'),
            content: { ...current.snapshot.content, rulerColor },
          },
        });
        outcome = await profiles.resume(operationId);
      } catch {
        throw new IdentityPreferenceWriteError(operationId, 'uncertain');
      }
      if (outcome !== 'applied') throw new IdentityPreferenceWriteError(operationId, 'rejected');
    },
  };
}
