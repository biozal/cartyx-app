import mongoose from 'mongoose';

const { BSON } = mongoose.mongo;
export const COLLECTIONS = ['users', 'campaigns'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
type Doc = Record<string, unknown>;
const object = (value: unknown): value is Doc =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const id = (value: unknown): string | undefined =>
  value instanceof BSON.ObjectId ? value.toHexString() : undefined;

/** Counts and field paths only. Never decrypts tokens, normalizes identities or repairs records. */
export class IdentityAudit {
  private counts = { users: 0, campaigns: 0 };
  private findings = new Map<string, number>();
  private fields = new Map<
    string,
    { path: (string | null)[]; type: string; occurrences: number }
  >();
  private users = new Map<string, Set<string>>();
  private campaigns = new Map<string, { gm?: string; members: Map<string, string> }>();
  private unique = new Map<string, Set<string>>();
  private fieldVisits = 0;

  private flag(code: string) {
    this.findings.set(code, (this.findings.get(code) ?? 0) + 1);
  }

  private inventory(value: unknown, path: (string | null)[], depth = 0) {
    if (depth > 100 || ++this.fieldVisits > 5_000_000) throw new Error('Audit limit exceeded');
    const type =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : value instanceof Date
            ? 'date'
            : typeof value === 'object' && value && '_bsontype' in value
              ? String(value._bsontype)
              : object(value)
                ? 'object'
                : typeof value;
    const key = JSON.stringify([path, type]);
    const field = this.fields.get(key);
    if (field) field.occurrences++;
    else this.fields.set(key, { path, type, occurrences: 1 });
    if (Array.isArray(value))
      value.forEach((entry) => this.inventory(entry, [...path, null], depth + 1));
    else if (object(value)) {
      for (const [key, entry] of Object.entries(value))
        this.inventory(entry, [...path, key], depth + 1);
    }
  }

  private sparseUnique(doc: Doc, field: string, collection: CollectionName) {
    // Sparse indexes omit missing fields; explicit null is still indexed. Arrays and
    // non-strings need manual review, not JS coercion or an invented matching rule.
    if (!Object.hasOwn(doc, field)) return;
    const value = doc[field];
    if (value !== null && typeof value !== 'string') {
      this.flag(`${collection}.${field}.invalid_type`);
      return;
    }
    const name = `${collection}.${field}`;
    const seen = this.unique.get(name) ?? new Set<string>();
    const key = JSON.stringify(value);
    if (seen.has(key)) this.flag(`${name}.duplicate_exact_value`);
    seen.add(key);
    this.unique.set(name, seen);
    if (value === null || value === '') this.flag(`${name}.null_or_empty`);
  }

  add(collection: CollectionName, raw: Uint8Array) {
    if (++this.counts[collection] > 100_000) throw new Error('Audit document limit exceeded');
    const doc = BSON.deserialize(raw, { promoteValues: false, bsonRegExp: true });
    this.inventory(doc, [collection]);
    const ownId = id(doc._id);
    if (!ownId) this.flag(`${collection}.invalid_id`);
    if (collection === 'users') {
      for (const field of ['email', 'providerId', 'audioStoragePrefix'])
        this.sparseUnique(doc, field, collection);
      if (!['gm', 'player', 'unknown'].includes(doc.role)) this.flag('users.invalid_role');
      if (
        doc.audioStoragePrefix != null &&
        (typeof doc.audioStoragePrefix !== 'string' ||
          !/^[0-9a-f]{32}$/.test(doc.audioStoragePrefix))
      ) {
        this.flag('users.invalid_audio_storage_prefix');
      }
      if (doc.oauthTokens != null) {
        if (!object(doc.oauthTokens)) this.flag('users.invalid_oauth_envelope');
        else
          for (const field of ['accessToken', 'refreshToken']) {
            const token = doc.oauthTokens[field];
            if (
              token != null &&
              (!object(token) ||
                !['ciphertext', 'iv', 'authTag'].every(
                  (part) => typeof token[part] === 'string' && token[part] !== ''
                ))
            ) {
              this.flag('users.invalid_oauth_envelope');
            }
          }
      }
      const links = new Set<string>();
      if (doc.campaigns !== undefined && !Array.isArray(doc.campaigns))
        this.flag('users.invalid_campaigns');
      for (const link of Array.isArray(doc.campaigns) ? doc.campaigns : []) {
        const campaignId = object(link) ? id(link.campaignId) : undefined;
        if (!campaignId) this.flag('users.invalid_campaign_reference');
        else {
          if (links.has(campaignId)) this.flag('users.duplicate_campaign_reference');
          links.add(campaignId);
        }
      }
      if (ownId) {
        if (this.users.has(ownId)) this.flag('users.duplicate_id');
        this.users.set(ownId, links);
      }
    } else {
      this.sparseUnique(doc, 'inviteCode', collection);
      const gm = id(doc.gameMasterId);
      if (!gm) this.flag('campaigns.invalid_game_master_reference');
      const members = new Map<string, string>();
      if (doc.members !== undefined && !Array.isArray(doc.members))
        this.flag('campaigns.invalid_members');
      for (const member of Array.isArray(doc.members) ? doc.members : []) {
        const userId = object(member) ? id(member.userId) : undefined;
        if (!userId) this.flag('campaigns.invalid_member_reference');
        else {
          if (members.has(userId)) this.flag('campaigns.duplicate_member_reference');
          const role = object(member) ? member.role : undefined;
          if (role !== 'gm' && role !== 'player') this.flag('campaigns.invalid_member_role');
          members.set(userId, typeof role === 'string' ? role : '');
        }
      }
      if (ownId) {
        if (this.campaigns.has(ownId)) this.flag('campaigns.duplicate_id');
        this.campaigns.set(ownId, { gm, members });
      }
    }
  }

  finish() {
    // Work on a copy so repeated verification cannot accumulate findings.
    const findings = new Map(this.findings);
    const flag = (code: string) => findings.set(code, (findings.get(code) ?? 0) + 1);
    for (const [userId, links] of this.users)
      for (const campaignId of links) {
        const campaign = this.campaigns.get(campaignId);
        if (!campaign) flag('users.orphan_campaign_reference');
        else if (!campaign.members.has(userId))
          flag('membership.user_link_without_campaign_member');
      }
    for (const [campaignId, campaign] of this.campaigns) {
      if (campaign.gm && !this.users.has(campaign.gm)) flag('campaigns.orphan_game_master');
      if (campaign.gm && campaign.members.get(campaign.gm) !== 'gm')
        flag('membership.game_master_not_gm_member');
      for (const userId of campaign.members.keys()) {
        const links = this.users.get(userId);
        if (!links) flag('campaigns.orphan_member');
        else if (!links.has(campaignId)) flag('membership.campaign_member_without_user_link');
      }
    }
    return {
      version: 1,
      counts: { ...this.counts },
      findings: Object.fromEntries([...findings].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      fields: [...this.fields.values()].sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0
      ),
    };
  }
}
