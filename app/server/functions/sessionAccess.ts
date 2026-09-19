import { Session } from '../db/models/Session';
import { campaigns } from '../repositories/campaigns';
import { identityRepository } from '../repositories/identity';
import { withLogging } from '../utils/logger';

export const requireSessionAccess = withLogging(
  'sessionAccess.requireSessionAccess',
  async (sessionId: string, userId: string) => {
    const dbUser = await identityRepository.findProfile(userId);
    if (!dbUser) throw new Error('User not found');

    const session = await Session.findById(sessionId).select('campaignId').lean();
    if (!session) throw new Error('Session not found');

    const campaign = await campaigns.get(String(session.campaignId));
    if (!campaign) throw new Error('Campaign not found');

    const member = campaign.members?.find((m) => String(m.userId) === String(dbUser.id));
    if (!member) throw new Error('Forbidden');

    return { dbUser, campaignId: String(session.campaignId), isGM: member.role === 'gm' };
  }
);
