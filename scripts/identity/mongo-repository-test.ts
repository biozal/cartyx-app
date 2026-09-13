import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { User, type IUser } from '../../app/server/db/models/User';
import { Campaign, type ICampaign } from '../../app/server/db/models/Campaign';
import {
  createMongoCampaignAccessRepository,
  createMongoIdentityRepository,
  createMongoMembershipMirror,
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

    // A duplicate random candidate cannot escape as an assigned namespace.
    const collisionOwners = await db
      .collection('users')
      .insertMany([{ role: 'player' }, { role: 'player' }]);
    const collisionRepository = createMongoIdentityRepository(users, () => 'd'.repeat(32));
    const ownerIds = Object.values(collisionOwners.insertedIds).map(String);
    const collisions = await Promise.allSettled(
      ownerIds.map((id) => collisionRepository.resolveAudioStoragePrefix(id))
    );
    assert.equal(collisions.filter((result) => result.status === 'fulfilled').length, 1);
    const failure = collisions.find((result) => result.status === 'rejected');
    assert.ok(
      failure?.status === 'rejected' &&
        failure.reason instanceof mongoose.mongo.MongoServerError &&
        failure.reason.code === 11000
    );
    const persistedPrefixes = await Promise.all(
      ownerIds.map((id) => collisionRepository.lookupAudioStoragePrefix(id))
    );
    assert.deepEqual(persistedPrefixes.sort(), ['d'.repeat(32), null].sort());

    // String domain IDs must still become BSON ObjectIds in Mongo campaign
    // queries, newly created members, and user-side membership mirrors.
    const mirrorOwner = await users.create({
      providerId: 'fixture_mirror_owner',
      role: 'gm',
      preferences: { rulerColor: '#123456' },
      audioStoragePrefix: 'e'.repeat(32),
    });
    const ownerId = String(mirrorOwner._id);
    const campaign = await campaigns.create({
      name: 'Fixture',
      gameMasterId: ownerId,
      members: [{ userId: ownerId, role: 'gm' }],
    });
    assert.equal(await campaigns.countDocuments({ 'members.userId': ownerId }), 1);
    const storedCampaign = await db.collection('campaigns').findOne({ _id: campaign._id });
    assert.ok(storedCampaign?.gameMasterId instanceof mongoose.Types.ObjectId);
    assert.ok(storedCampaign.members[0].userId instanceof mongoose.Types.ObjectId);
    const link = {
      campaignId: String(campaign._id),
      joinedAt: new Date('2026-09-13'),
      status: 'active',
    };
    const mirror = createMongoMembershipMirror(users);
    await mirror.addCampaignLink(ownerId, link);
    const mirroredUser = await db.collection('users').findOne({ _id: mirrorOwner._id });
    assert.ok(mirroredUser?.campaigns[0].campaignId instanceof mongoose.Types.ObjectId);
    assert.deepEqual(mirroredUser.campaigns[0].joinedAt, link.joinedAt);
    assert.equal(mirroredUser.campaigns[0].status, 'active');
    assert.equal(mirroredUser.audioStoragePrefix, 'e'.repeat(32));
    assert.deepEqual(mirroredUser.preferences, { rulerColor: '#123456' });
    await mirror.addCampaignLink('000000000000000000000000', link);
    assert.equal(await users.countDocuments({ _id: '000000000000000000000000' }), 0);

    // Campaign creation and its user mirror must share the same transaction.
    const transaction = await connection.startSession();
    const abortedCampaignId = new mongoose.Types.ObjectId();
    const committedCampaignId = new mongoose.Types.ObjectId();
    try {
      await assert.rejects(
        transaction.withTransaction(async () => {
          await campaigns.create(
            [{ _id: abortedCampaignId, name: 'Abort fixture', gameMasterId: ownerId }],
            { session: transaction }
          );
          await createMongoMembershipMirror(users, transaction).appendCampaignLink(ownerId, {
            ...link,
            campaignId: String(abortedCampaignId),
          });
          throw new Error('fixture rollback');
        }),
        /fixture rollback/
      );
      assert.equal(await campaigns.countDocuments({ _id: abortedCampaignId }), 0);
      assert.equal(
        await users.countDocuments({ _id: ownerId, 'campaigns.campaignId': abortedCampaignId }),
        0
      );
      await transaction.withTransaction(async () => {
        await campaigns.create(
          [{ _id: committedCampaignId, name: 'Commit fixture', gameMasterId: ownerId }],
          { session: transaction }
        );
        await createMongoMembershipMirror(users, transaction).appendCampaignLink(ownerId, {
          ...link,
          campaignId: String(committedCampaignId),
        });
      });
      assert.equal(await campaigns.countDocuments({ _id: committedCampaignId }), 1);
      assert.equal(
        await users.countDocuments({ _id: ownerId, 'campaigns.campaignId': committedCampaignId }),
        1
      );
    } finally {
      await transaction.endSession();
    }
  } finally {
    await connection.close();
  }
}
