import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { User, type IUser } from '../../app/server/db/models/User';
import { Campaign, type ICampaign } from '../../app/server/db/models/Campaign';
import {
  createMongoCampaignAccessRepository,
  createMongoIdentityRepository,
} from '../../app/server/repositories/identity/mongo';
import { identityRepositoryContract } from './repository-contract';

/** Called only with the disposable authenticated Docker fixture's URI. */
export async function testMongoIdentityRepository(fixtureUri: string) {
  const connection = await mongoose
    .createConnection(fixtureUri, {
      dbName: 'identity_repository_fixture',
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 10_000,
    })
    .asPromise();
  try {
    const users = connection.model<IUser>('IdentityUser', User.schema.clone(), 'users');
    const campaigns = connection.model<ICampaign>(
      'IdentityCampaign',
      Campaign.schema.clone(),
      'campaigns'
    );
    await users.createCollection();
    await campaigns.createCollection();
    await users.createIndexes();
    await campaigns.createIndexes();
    const db = connection.db!;
    const objectId = (value: string) => new mongoose.Types.ObjectId(value);
    await identityRepositoryContract({
      identity: createMongoIdentityRepository(users),
      access: createMongoCampaignAccessRepository(campaigns),
      async seedUser(document) {
        const result = await db.collection('users').insertOne(document);
        return result.insertedId.toHexString();
      },
      async readUser(id) {
        const document = await db.collection('users').findOne({ _id: objectId(id) });
        assert.ok(document);
        return document;
      },
      isConflict: (error) =>
        error instanceof mongoose.mongo.MongoServerError && error.code === 11000,
      countUsers: (providerId) => db.collection('users').countDocuments({ providerId }),
      async seedCampaign(userId) {
        const result = await db.collection('campaigns').insertOne({
          gameMasterId: objectId(userId),
          members: [{ userId: objectId(userId), role: 'gm' }],
        });
        return result.insertedId.toHexString();
      },
      async revokeMembership(campaignId) {
        await db
          .collection('campaigns')
          .updateOne(
            { _id: objectId(campaignId) },
            { $unset: { gameMasterId: '' }, $set: { members: [] } }
          );
      },
    });
  } finally {
    await connection.close();
  }
}
