import { User } from '../../db/models/User';
import { Campaign } from '../../db/models/Campaign';
import { createMongoCampaignAccessRepository, createMongoIdentityRepository } from './mongo';

// Deliberately fixed until all identity consumers and the target importer/recovery
// contracts are ready. No environment flag can activate a partial graph cutover.
export const identityRepository = createMongoIdentityRepository(User);
export const campaignAccessRepository = createMongoCampaignAccessRepository(Campaign);
