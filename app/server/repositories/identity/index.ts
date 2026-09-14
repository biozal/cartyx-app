import { User } from '../../db/models/User';
import { Campaign } from '../../db/models/Campaign';
import { connectDB, isDBConnected } from '../../db/connection';
import { createIdentityStorage } from './availability';
import {
  createMongoCampaignAccessRepository,
  createMongoIdentityRepository,
  createMongoMembershipMirror,
} from './mongo';

// Deliberately fixed until all identity consumers and the target importer/recovery
// contracts are ready. No environment flag can activate a partial graph cutover.
const identityStorage = createIdentityStorage(createMongoIdentityRepository(User), async () => {
  await connectDB();
  return isDBConnected();
});
export const identityRepository = identityStorage.repository;
// Explicit caller decisions use the same selected adapter as operations.
export const ensureIdentityAvailable = identityStorage.ensureAvailable;
export const campaignAccessRepository = createMongoCampaignAccessRepository(Campaign);
export const identityMembershipMirror = createMongoMembershipMirror(User);
