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
  readAccessToken(providerId: string): Promise<{
    ciphertext?: string | null;
    iv?: string | null;
    authTag?: string | null;
  } | null>;
  clearTokens(providerId: string): Promise<void>;
  readPreferences(providerId: string): Promise<{ rulerColor?: string | null } | null>;
  setRulerColor(providerId: string, rulerColor: string): Promise<void>;
}

/** Transitional membership authority: campaign data stays on MongoDB. */
export interface CampaignAccessRepository {
  findAccess(campaignId: string): Promise<{
    gameMasterId: string | null;
    members: { userId: string; role?: string | null }[];
  } | null>;
}
