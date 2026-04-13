import { Session } from '../db/models/Session';
import { Campaign } from '../db/models/Campaign';
import { User } from '../db/models/User';

export async function requireSessionAccess(sessionId: string, userId: string) {
  const dbUser = await User.findOne({ providerId: userId });
  if (!dbUser) throw new Error('User not found');

  const session = await Session.findById(sessionId).select('campaignId').lean();
  if (!session) throw new Error('Session not found');

  const campaign = await Campaign.findById((session as any).campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const isMember = (campaign as any).members?.some(
    (m: { userId: unknown }) => String(m.userId) === String(dbUser._id)
  );
  if (!isMember) throw new Error('Forbidden');

  return { dbUser, campaignId: String((session as any).campaignId) };
}
