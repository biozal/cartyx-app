import gremlin from 'gremlin';
import { findIdentity, graphIdentity } from '../../db/graph/identity';
import {
  parseProfile,
  profileSnapshotSchema,
  profileDigest,
  type ProfileSnapshot,
  type ImmutableProfileStore,
} from './profile-model';
export interface ProfileGraphClient {
  execute(traversal: gremlin.process.GraphTraversal): Promise<unknown[]>;
}
const __ = gremlin.process.statics;
const properties = {
  firstName: 'identityProfileFirstName',
  lastName: 'identityProfileLastName',
  avatarUrl: 'identityProfileAvatarUrl',
  role: 'identityProfileRole',
  rulerColor: 'identityProfileRulerColor',
  createdAt: 'identityProfileCreatedAt',
  lastLoginAt: 'identityProfileLastLoginAt',
} as const;
export const profileUserIdentity = (id: string) => graphIdentity('User', id, { type: 'global' });
export const profileRevisionIdentity = (userId: string, snapshotId: string) =>
  graphIdentity('UserProfileRevision', snapshotId, { type: 'user', id: userId });

/** Immutable-by-API content. Runtime authorization must prevent bypassing this API before cutover. */
export function createGraphProfileStore(client: ProfileGraphClient): ImmutableProfileStore {
  async function readVertex(userId: string, snapshotId: string): Promise<ProfileSnapshot | null> {
    const identity = profileRevisionIdentity(userId, snapshotId);
    const rows = await client.execute(
      findIdentity(identity)
        .limit(2)
        .project('label', 'properties')
        .by(__.label())
        .by(__.valueMap())
    );
    if (!rows.length) return null;
    if (
      rows.length !== 1 ||
      !(rows[0] instanceof Map) ||
      rows[0].get('label') !== 'UserProfileRevision'
    )
      throw new Error('Invalid profile graph vertex');
    const values = rows[0].get('properties');
    if (!(values instanceof Map)) throw new Error('Invalid profile graph properties');
    const allowed = new Set([
      'scope',
      'kind',
      'entityId',
      'identityProfileDigest',
      ...Object.values(properties),
    ]);
    for (const [key, value] of values) {
      if (
        !allowed.has(key) ||
        !Array.isArray(value) ||
        value.length !== 1 ||
        typeof value[0] !== 'string'
      )
        throw new Error('Invalid profile graph properties');
    }
    const value = (key: string): string | null => values.get(key)?.[0] ?? null;
    if (
      value('scope') !== identity.scope ||
      value('kind') !== identity.kind ||
      value('entityId') !== identity.entityId
    )
      throw new Error('Profile graph identity mismatch');
    const content = Object.fromEntries(
      Object.entries(properties).map(([field, key]) => [field, value(key)])
    );
    const snapshot = parseProfile(profileSnapshotSchema, { userId, snapshotId, content });
    if (value('identityProfileDigest') !== profileDigest(snapshot))
      throw new Error('Profile graph digest mismatch');
    return snapshot;
  }
  async function checkOwner(userId: string) {
    const labels = await client.execute(findIdentity(profileUserIdentity(userId)).limit(2).label());
    if (labels.length !== 1 || labels[0] !== 'User')
      throw new Error('Profile graph owner missing or invalid');
  }
  async function checkLink(userId: string, snapshotId: string) {
    const identity = profileRevisionIdentity(userId, snapshotId);
    const counts = await client.execute(
      findIdentity(profileUserIdentity(userId))
        .out('HAS_PROFILE_REVISION')
        .has('scope', identity.scope)
        .has('kind', identity.kind)
        .has('entityId', identity.entityId)
        .limit(2)
        .count()
    );
    if (counts[0] !== 1) throw new Error('Profile graph link missing or duplicated');
  }
  return {
    async put(input) {
      const snapshot = parseProfile(profileSnapshotSchema, input);
      const owner = profileUserIdentity(snapshot.userId);
      const identity = profileRevisionIdentity(snapshot.userId, snapshot.snapshotId);
      // Existing values are never updated. Partial creation is repairable on explicit resume.
      await client.execute(
        findIdentity(owner)
          .fold()
          .coalesce(
            __.unfold(),
            __.addV('User')
              .property('scope', owner.scope)
              .property('kind', owner.kind)
              .property('entityId', owner.entityId)
          )
          .count()
      );
      await checkOwner(snapshot.userId);
      let create = __.addV('UserProfileRevision')
        .property('scope', identity.scope)
        .property('kind', identity.kind)
        .property('entityId', identity.entityId)
        .property('identityProfileDigest', profileDigest(snapshot));
      for (const [field, key] of Object.entries(properties)) {
        const value = snapshot.content[field as keyof typeof properties];
        if (value !== null) create = create.property(key, value);
      }
      await client.execute(findIdentity(identity).fold().coalesce(__.unfold(), create).count());
      const stored = await readVertex(snapshot.userId, snapshot.snapshotId);
      if (!stored || profileDigest(stored) !== profileDigest(snapshot))
        throw new Error('Profile revision ID reused');
      await client.execute(
        findIdentity(owner)
          .as('owner')
          .V()
          .has('scope', identity.scope)
          .has('kind', identity.kind)
          .has('entityId', identity.entityId)
          .coalesce(
            __.inE('HAS_PROFILE_REVISION').where(
              __.outV()
                .has('scope', owner.scope)
                .has('kind', owner.kind)
                .has('entityId', owner.entityId)
            ),
            __.addE('HAS_PROFILE_REVISION').from_('owner')
          )
          .count()
      );
      await checkLink(snapshot.userId, snapshot.snapshotId);
    },
    async get(userId, snapshotId) {
      const snapshot = await readVertex(userId, snapshotId);
      if (!snapshot) return null;
      await checkOwner(userId);
      await checkLink(userId, snapshotId);
      return snapshot;
    },
  };
}
