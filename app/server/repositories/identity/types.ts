/** Domain-facing identity contract. No driver documents, queries or ObjectIds. */
export interface IdentityProfile {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
}

export interface EncryptedIdentityToken {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Server-only fence for one stored token generation; never put it in a session. */
export interface IdentityTokenFence {
  userId: string;
  providerId: string;
  tokenRevision: string;
}

export interface IdentityAccessToken extends IdentityTokenFence {
  accessToken: {
    ciphertext?: string | null;
    iv?: string | null;
    authTag?: string | null;
  };
}

export type IdentityTokenClearOutcome = 'cleared' | 'stale';

export interface RecordIdentityLogin {
  providerId: string;
  provider: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  oauthTokens: {
    accessToken: EncryptedIdentityToken | null;
    refreshToken: EncryptedIdentityToken | null;
  };
  lastLoginAt: Date;
}

/**
 * The runtime composition establishes availability; callers establish authorization.
 * Direct operator adapters establish their own connections. This is server-only.
 * Missing optional login fields leave stored values intact. Identity strings are
 * exact values, including provider prefixes and email casing. Writes reject on
 * failure/uncertain completion; callers must not mint a session on rejection.
 */
export interface IdentityRepository {
  recordLogin(input: RecordIdentityLogin): Promise<IdentityProfile>;
  findProfile(providerId: string): Promise<IdentityProfile | null>;
  findUserId(providerId: string): Promise<string | null>;
  readDisplayName(userId: string): Promise<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null>;
  /** Lazily assigns an immutable namespace; never returns an unpersisted candidate. */
  resolveAudioStoragePrefix(userId: string): Promise<string>;
  /** Read-only, including when the user or prefix is missing. */
  lookupAudioStoragePrefix(userId: string): Promise<string | null>;
  readAccessToken(providerId: string): Promise<IdentityAccessToken | null>;
  /** Clear only the observed generation. Does not revoke an external provider grant. */
  clearTokens(fence: IdentityTokenFence): Promise<IdentityTokenClearOutcome>;
  readPreferences(providerId: string): Promise<{ rulerColor?: string | null } | null>;
  setRulerColor(providerId: string, rulerColor: string): Promise<void>;
}

export interface IdentityCampaignLink {
  campaignId: string;
  joinedAt: Date;
  status: string;
}

/** Legacy user-side membership mirror. Never an authority for access decisions. */
export interface IdentityMembershipMirrorRepository {
  appendCampaignLink(userId: string, link: IdentityCampaignLink): Promise<void>;
  addCampaignLink(userId: string, link: IdentityCampaignLink): Promise<void>;
}

/** Transitional membership authority: campaign data stays on MongoDB. */
export interface CampaignAccessRepository {
  findAccess(campaignId: string): Promise<{
    gameMasterId: string | null;
    members: { userId: string; role?: string | null }[];
  } | null>;
}
