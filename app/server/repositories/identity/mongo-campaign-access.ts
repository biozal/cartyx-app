import type { Model } from 'mongoose';
import type { ICampaign } from '../../db/models/Campaign';
import type { CampaignAccessRepository } from './types';

/**
 * Transitional membership authority: campaigns stay on MongoDB until their own slice.
 * The user ids it compares are whatever identity issues, so a rebuilt environment must
 * seed users before campaigns.
 */
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
