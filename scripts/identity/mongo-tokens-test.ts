import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import type { IUser } from '../../app/server/db/models/User';
import { createMongoIdentityRepository } from '../../app/server/repositories/identity/mongo';
import type {
  IdentityAccessToken,
  RecordIdentityLogin,
} from '../../app/server/repositories/identity/types';

/** Real Mongo operations, with delays/faults around the physical conditional update. */
export async function testMongoIdentityTokens(users: Model<IUser>) {
  const identity = createMongoIdentityRepository(users);
  const input = (): RecordIdentityLogin => ({
    provider: 'fixture',
    providerId: `fixture_tokens_${randomUUID()}`,
    oauthTokens: {
      accessToken: { ciphertext: 'cipher', iv: 'iv', authTag: 'tag' },
      refreshToken: null,
    },
    lastLoginAt: new Date('2026-09-13T00:00:00.000Z'),
  });
  const fence = (read: IdentityAccessToken) => ({
    userId: read.userId,
    providerId: read.providerId,
    tokenRevision: read.tokenRevision,
  });
  const intercept = (write: (...args: Parameters<typeof users.updateOne>) => Promise<unknown>) =>
    createMongoIdentityRepository(
      new Proxy(users, {
        get(target, property) {
          if (property === 'updateOne') return write;
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      })
    );

  for (const oldWriter of [false, true]) {
    const login = input();
    const user = await identity.recordLogin(login);
    const observed = (await identity.readAccessToken(login.providerId))!;
    const publicDocument = await users.findById(user.id).lean();
    assert.ok(!Object.hasOwn(publicDocument!, 'oauthTokens'));
    let delayed = false;
    const racing = intercept(async (...args) => {
      if (!delayed) {
        delayed = true;
        if (oldWriter)
          await users.collection.updateOne(
            { providerId: login.providerId },
            { $set: { oauthTokens: login.oauthTokens } }
          );
        else await identity.recordLogin(login);
      }
      return users.updateOne(...args);
    });
    assert.equal(await racing.clearTokens(fence(observed)), 'stale');
    const current = (await identity.readAccessToken(login.providerId))!;
    assert.notEqual(current.tokenRevision, observed.tokenRevision);
    assert.deepEqual(current.accessToken, observed.accessToken);
  }

  // A legacy upgrade cannot attach its old revision/envelope to a concurrent login.
  const legacy = input();
  await users.collection.insertOne({
    providerId: legacy.providerId,
    provider: legacy.provider,
    oauthTokens: legacy.oauthTokens,
  });
  let delayed = false;
  const upgrade = intercept(async (...args) => {
    if (!delayed) {
      delayed = true;
      await identity.recordLogin(legacy);
    }
    return users.updateOne(...args);
  });
  assert.deepEqual(
    await upgrade.readAccessToken(legacy.providerId),
    await identity.readAccessToken(legacy.providerId)
  );
  assert.ok(delayed);

  // No implicit retry of uncertain writes, whether a legacy upgrade or a clear.
  for (const kind of ['upgrade', 'clear'] as const)
    for (const afterCommit of [false, true]) {
      const login = input();
      let observed: IdentityAccessToken | undefined;
      if (kind === 'upgrade')
        await users.collection.insertOne({
          providerId: login.providerId,
          provider: login.provider,
          oauthTokens: login.oauthTokens,
        });
      else {
        await identity.recordLogin(login);
        observed = (await identity.readAccessToken(login.providerId))!;
      }
      let writes = 0;
      const interrupted = intercept(async (...args) => {
        writes++;
        if (afterCommit) await users.updateOne(...args);
        throw new Error('Mongo token mutation uncertain');
      });
      await assert.rejects(
        kind === 'upgrade'
          ? interrupted.readAccessToken(login.providerId)
          : interrupted.clearTokens(fence(observed!)),
        /Mongo token mutation uncertain/
      );
      assert.equal(writes, 1);
      if (kind === 'clear')
        assert.equal(
          await identity.clearTokens(fence(observed!)),
          afterCommit ? 'stale' : 'cleared'
        );
      else assert.ok(await identity.readAccessToken(login.providerId));
    }
}
