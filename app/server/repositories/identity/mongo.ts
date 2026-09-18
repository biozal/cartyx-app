import { randomBytes, randomUUID } from 'node:crypto';
import { parseIdentityTokenFence } from './token-fence';
import type { ClientSession, Model } from 'mongoose';
import type { IUser } from '../../db/models/User';
import type {
  IdentityProfile,
  IdentityRepository,
  IdentityMembershipMirrorRepository,
} from './types';

// Explicit projection into domain values: never return a Mongoose document or
// spread a stored record (which may contain token envelopes or media identifiers).
function profile(doc: IUser & { _id: unknown }): IdentityProfile {
  return {
    id: String(doc._id),
    email: doc.email,
    firstName: doc.firstName,
    lastName: doc.lastName,
    avatarUrl: doc.avatarUrl,
    role: doc.role,
  };
}

export function createMongoIdentityRepository(
  users: Model<IUser>,
  mintAudioPrefix: () => string = () => randomBytes(16).toString('hex')
): IdentityRepository {
  return {
    async recordLogin(input) {
      // Enumerate permitted fields. Even a structurally wider caller cannot set
      // role, _id, membership, preferences or audioStoragePrefix through login.
      const update = {
        providerId: input.providerId,
        provider: input.provider,
        ...(input.email !== undefined && { email: input.email }),
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        oauthTokens: {
          revision: randomUUID(),
          accessToken: input.oauthTokens.accessToken,
          refreshToken: input.oauthTokens.refreshToken,
        },
        lastLoginAt: input.lastLoginAt,
      };
      let stored = await users.findOneAndUpdate(
        { providerId: input.providerId },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!stored && input.email) {
        // Mongo's null equality includes missing providerId. Claim an email-only
        // account atomically; never attach a second provider to a bound account.
        stored = await users.findOneAndUpdate(
          { email: input.email, providerId: null },
          { $set: update },
          { returnDocument: 'after' }
        );
      }
      if (!stored) {
        stored = await users.findOneAndUpdate(
          { providerId: input.providerId },
          { $set: update, $setOnInsert: { createdAt: input.lastLoginAt, role: 'unknown' } },
          { upsert: true, returnDocument: 'after' }
        );
      }
      if (!stored) throw new Error('Identity was not persisted');
      return profile(stored);
    },
    async findProfile(providerId) {
      const stored = await users.findOne({ providerId });
      return stored ? profile(stored) : null;
    },
    async findUserId(providerId) {
      const stored = await users.findOne({ providerId });
      return stored ? String(stored._id) : null;
    },
    async readDisplayName(userId) {
      const stored = await users.findById(userId).select('firstName lastName email').lean();
      return stored
        ? { firstName: stored.firstName, lastName: stored.lastName, email: stored.email }
        : null;
    },
    async resolveAudioStoragePrefix(userId) {
      const existing = await users.findById(userId).select('audioStoragePrefix').lean();
      if (!existing) throw new Error('User not found');
      if (existing.audioStoragePrefix) return existing.audioStoragePrefix;
      const minted = mintAudioPrefix();
      if (!/^[0-9a-f]{32}$/.test(minted)) throw new Error('Invalid audio storage prefix');
      // Null/missing only: a racing uploader cannot replace an established prefix.
      const updated = await users
        .findOneAndUpdate(
          { _id: userId, audioStoragePrefix: { $in: [null] } },
          { $set: { audioStoragePrefix: minted } },
          { returnDocument: 'after' }
        )
        .select('audioStoragePrefix')
        .lean();
      if (updated?.audioStoragePrefix) return updated.audioStoragePrefix;
      const raced = await users.findById(userId).select('audioStoragePrefix').lean();
      if (!raced?.audioStoragePrefix) throw new Error('Failed to assign audio storage prefix');
      return raced.audioStoragePrefix;
    },
    async lookupAudioStoragePrefix(userId) {
      const stored = await users.findById(userId).select('audioStoragePrefix').lean();
      return stored?.audioStoragePrefix ?? null;
    },
    async readAccessToken(providerId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const stored = await users.findOne({ providerId }).select('+oauthTokens').lean();
        const token = stored?.oauthTokens?.accessToken;
        if (!stored || !token) return null;
        let tokenRevision = stored.oauthTokens?.revision;
        if (tokenRevision === undefined) {
          tokenRevision = randomUUID();
          // Upgrade a legacy envelope only while the entire original pair is still
          // current. A newer login always installs a revision in its atomic update.
          const upgraded = await users
            .updateOne(
              {
                _id: stored._id,
                providerId,
                'oauthTokens.revision': { $exists: false },
                oauthTokens: stored.oauthTokens,
              },
              { $set: { 'oauthTokens.revision': tokenRevision } }
            )
            .catch(() => {
              // Casting/driver errors may include the sensitive comparison value.
              // OAuth reports errors to telemetry, so do not propagate that cause.
              throw new Error('Identity token revision upgrade uncertain');
            });
          if (upgraded.matchedCount === 0) continue; // Definitive CAS loss only.
        }
        const fence = parseIdentityTokenFence({
          userId: String(stored._id),
          providerId,
          tokenRevision: tokenRevision as string,
        });
        return {
          ...fence,
          accessToken: { ciphertext: token.ciphertext, iv: token.iv, authTag: token.authTag },
        };
      }
      throw new Error('Identity token read contended');
    },
    async clearTokens(input) {
      const fence = parseIdentityTokenFence(input);
      const result = await users.updateOne(
        {
          _id: fence.userId,
          providerId: fence.providerId,
          'oauthTokens.revision': fence.tokenRevision,
        },
        { $unset: { oauthTokens: '' } }
      );
      return result.matchedCount === 1 ? 'cleared' : 'stale';
    },
    async readPreferences(providerId) {
      const stored = await users.findOne({ providerId }).select('preferences').lean();
      return stored?.preferences ? { rulerColor: stored.preferences.rulerColor } : null;
    },
    async setRulerColor(providerId, rulerColor) {
      await users.updateOne({ providerId }, { $set: { 'preferences.rulerColor': rulerColor } });
    },
  };
}

export function createMongoMembershipMirror(
  users: Model<IUser>,
  session?: ClientSession
): IdentityMembershipMirrorRepository {
  // Preserve the existing $push/$addToSet behavior, including Mongoose's
  // subdocument IDs. This mirror API does not promise idempotent membership.
  return {
    async appendCampaignLink(userId, link) {
      const update = {
        $push: {
          campaigns: { campaignId: link.campaignId, joinedAt: link.joinedAt, status: link.status },
        },
      };
      if (session) await users.updateOne({ _id: userId }, update, { session });
      else await users.updateOne({ _id: userId }, update);
    },
    async addCampaignLink(userId, link) {
      const update = {
        $addToSet: {
          campaigns: { campaignId: link.campaignId, status: link.status, joinedAt: link.joinedAt },
        },
      };
      if (session) await users.updateOne({ _id: userId }, update, { session });
      else await users.updateOne({ _id: userId }, update);
    },
  };
}
