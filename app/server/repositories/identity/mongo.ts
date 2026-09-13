import type { Model } from 'mongoose';
import type { IUser } from '../../db/models/User';
import type { ICampaign } from '../../db/models/Campaign';
import type { CampaignAccessRepository, IdentityProfile, IdentityRepository } from './types';

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

export function createMongoIdentityRepository(users: Model<IUser>): IdentityRepository {
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
      const stored = await users.findOne({ providerId }).lean();
      return stored ? profile(stored) : null;
    },
    async findUserId(providerId) {
      const stored = await users.findOne({ providerId });
      return stored ? String(stored._id) : null;
    },
    async readAccessToken(providerId) {
      const stored = await users.findOne({ providerId }).select('+oauthTokens').lean();
      const token = stored?.oauthTokens?.accessToken;
      return token ? { ciphertext: token.ciphertext, iv: token.iv, authTag: token.authTag } : null;
    },
    async clearTokens(providerId) {
      await users.updateOne({ providerId }, { $unset: { oauthTokens: '' } });
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

export function createMongoCampaignAccessRepository(
  campaigns: Model<ICampaign>
): CampaignAccessRepository {
  return {
    async findAccess(campaignId) {
      const campaign = await campaigns.findById(campaignId);
      if (!campaign) return null;
      return {
        gameMasterId: campaign.gameMasterId == null ? null : String(campaign.gameMasterId),
        members: (campaign.members ?? []).map((member) => ({
          userId: String(member.userId),
          role: member.role,
        })),
      };
    },
  };
}
