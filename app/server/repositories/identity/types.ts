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
 * Caller establishes availability and authorization; this interface is server-only.
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
  readAccessToken(providerId: string): Promise<{
    ciphertext?: string | null;
    iv?: string | null;
    authTag?: string | null;
  } | null>;
  clearTokens(providerId: string): Promise<void>;
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
