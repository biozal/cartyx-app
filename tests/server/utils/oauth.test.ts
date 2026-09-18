import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('~/server/repositories/identity', () => import('../functions/identityTestDouble'));

// These tests reset the module registry between cases so `oauth.ts` re-reads its
// environment. The double is reached through the mocked path, which is the same
// instance the code under test resolves; importing the double's own path would hand
// this file a second copy whose mocks nothing calls.
let identity: typeof import('../functions/identityTestDouble');
async function useIdentity(profile: { id: string; role?: string } | null) {
  identity = (await import('~/server/repositories/identity')) as unknown as typeof identity;
  identity.resetIdentityDouble(profile);
  return identity;
}

const mockConnectDB = vi.fn();
const mockIsDBConnected = vi.fn(() => true);
vi.mock('~/server/db/connection', () => ({
  connectDB: (...args: unknown[]) => mockConnectDB(...args),
  isDBConnected: () => mockIsDBConnected(),
}));

// Mock fetch globally for revokeToken tests
const originalFetch = globalThis.fetch;

// SESSION_SECRET drives the token-encryption key derivation.
process.env.SESSION_SECRET = 'test-secret-for-unit-tests-at-least-32-chars';

/**
 * The stored token generation `revokeToken` observes. `null` means the account has no
 * usable token, which is what makes the early returns below meaningful.
 */
function storedAccessToken(
  value: {
    userId?: string;
    providerId: string;
    tokenRevision?: string;
    accessToken: { ciphertext: string; iv: string; authTag: string };
  } | null
) {
  identity.identityRepository.readAccessToken.mockResolvedValue(
    value === null
      ? null
      : {
          userId: value.userId ?? '1'.repeat(24),
          providerId: value.providerId,
          tokenRevision: value.tokenRevision ?? '11111111-1111-4111-8111-111111111111',
          accessToken: value.accessToken,
        }
  );
}

describe('PKCE: generateCodeVerifier / deriveCodeChallenge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('generates a URL-safe (base64url) verifier of the expected length, unique per call', async () => {
    const { generateCodeVerifier } = await import('~/server/utils/oauth');
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();

    // base64url charset only: A-Z a-z 0-9 - _ (no +, /, or = padding)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes -> 43-char base64url string (within RFC 7636's 43-128).
    expect(a).toHaveLength(43);
    expect(b).toHaveLength(43);
    // Cryptographically random => different each call.
    expect(a).not.toBe(b);
  });

  it('derives code_challenge = base64url(sha256(verifier)) for S256', async () => {
    const { deriveCodeChallenge } = await import('~/server/utils/oauth');
    const { createHash } = await import('node:crypto');

    const verifier = 'test-verifier-fixed-value';
    const expected = createHash('sha256').update(verifier).digest('base64url');

    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).toBe(expected);
    // SHA-256 -> 32 bytes -> 43-char base64url, URL-safe charset, no padding.
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toHaveLength(43);
    expect(challenge).not.toContain('=');
  });

  it('RFC 7636 vector: known verifier maps to the known challenge', async () => {
    const { deriveCodeChallenge } = await import('~/server/utils/oauth');
    // From RFC 7636 Appendix B.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(deriveCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('PKCE: authorize URLs include code_challenge + S256', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.BASE_URL = 'https://example.com';
    process.env.GOOGLE_CLIENT_ID = 'g-client';
    process.env.GITHUB_CLIENT_ID = 'gh-client';
    process.env.APPLE_CLIENT_ID = 'apple-client';
  });

  it('Google authorize URL includes code_challenge and S256 when challenge provided', async () => {
    const { buildGoogleOAuthUrl } = await import('~/server/utils/oauth');
    const url = buildGoogleOAuthUrl('state-1', 'challenge-abc');
    expect(url).toContain('code_challenge=challenge-abc');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=state-1');
  });

  it('GitHub authorize URL includes code_challenge and S256 when challenge provided', async () => {
    const { buildGithubOAuthUrl } = await import('~/server/utils/oauth');
    const url = buildGithubOAuthUrl('state-2', 'challenge-def');
    expect(url).toContain('code_challenge=challenge-def');
    expect(url).toContain('code_challenge_method=S256');
  });

  it('Apple authorize URL includes code_challenge and S256 when challenge provided', async () => {
    const { buildAppleOAuthUrl } = await import('~/server/utils/oauth');
    const url = buildAppleOAuthUrl('state-3', 'challenge-ghi');
    expect(url).toContain('code_challenge=challenge-ghi');
    expect(url).toContain('code_challenge_method=S256');
  });

  it('omits code_challenge params when no challenge is provided (behavior-preserving)', async () => {
    const { buildGoogleOAuthUrl, buildGithubOAuthUrl, buildAppleOAuthUrl } =
      await import('~/server/utils/oauth');
    for (const url of [
      buildGoogleOAuthUrl('s'),
      buildGithubOAuthUrl('s'),
      buildAppleOAuthUrl('s'),
    ]) {
      expect(url).not.toContain('code_challenge');
      expect(url).not.toContain('S256');
    }
  });
});

describe('PKCE: token exchange includes code_verifier', () => {
  const originalFetchLocal = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env.BASE_URL = 'https://example.com';
    process.env.GOOGLE_CLIENT_ID = 'g-client';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    process.env.GITHUB_CLIENT_ID = 'gh-client';
    process.env.GITHUB_CLIENT_SECRET = 'gh-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetchLocal;
  });

  it('Google token exchange request body includes code_verifier', async () => {
    const fetchMock = vi
      .fn()
      // token endpoint
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'g-access' }) })
      // userinfo endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '42', name: 'X', email: 'x@y.z' }),
      });
    globalThis.fetch = fetchMock;

    const { exchangeGoogleCode } = await import('~/server/utils/oauth');
    await exchangeGoogleCode('the-code', 'verifier-123');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    const body = init.body.toString();
    expect(body).toContain('code_verifier=verifier-123');
    expect(body).toContain('code=the-code');
  });

  it('GitHub token exchange request body includes code_verifier', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'gh-access' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 7, name: 'X', email: 'x@y.z', avatar_url: null }),
      });
    globalThis.fetch = fetchMock;

    const { exchangeGithubCode } = await import('~/server/utils/oauth');
    await exchangeGithubCode('gh-code', 'verifier-456');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as { code_verifier?: string; code?: string };
    expect(body.code_verifier).toBe('verifier-456');
    expect(body.code).toBe('gh-code');
  });

  it('exchange omits code_verifier when none is supplied (behavior-preserving)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'g-access' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '42' }) });
    globalThis.fetch = fetchMock;

    const { exchangeGoogleCode } = await import('~/server/utils/oauth');
    await exchangeGoogleCode('the-code');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(init.body.toString()).not.toContain('code_verifier');
  });
});

describe('upsertUser', () => {
  beforeEach(async () => {
    vi.resetModules();
    await useIdentity({ id: '1'.repeat(24), role: 'gm' });
    mockConnectDB.mockClear();
    mockIsDBConnected.mockReturnValue(true);
  });

  it('rethrows when the identity write fails', async () => {
    const dbError = new Error('Database not connected');
    identity.identityRepository.recordLogin.mockRejectedValue(dbError);

    const { upsertUser } = await import('~/server/utils/oauth');
    const profile = {
      id: 'google_123',
      provider: 'google' as const,
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      accessToken: 'tok',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    };

    // A persistence failure must surface, not be swallowed into a broken session:
    // the OAuth callback relies on this throw to redirect to an error page rather
    // than logging the user in with an unpersisted "unknown" session.
    await expect(upsertUser(profile)).rejects.toThrow(dbError);
    expect(identity.identityRepository.recordLogin).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the store is not available (no broken session)', async () => {
    identity.identityDouble.available = false;

    const { upsertUser } = await import('~/server/utils/oauth');
    const profile = {
      id: 'google_offline',
      provider: 'google' as const,
      name: 'Test User',
      email: 'test@example.com',
      avatar: null,
      accessToken: 'tok',
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    };

    // No DB means we can't persist the account: auth must fail rather than mint
    // an unpersisted "unknown" session.
    await expect(upsertUser(profile)).rejects.toThrow(/not connected/);
    expect(identity.identityRepository.recordLogin).not.toHaveBeenCalled();
  });

  it('refuses to mint a session when the repository answers with no account', async () => {
    identity.identityRepository.recordLogin.mockResolvedValue(null as never);
    const { upsertUser } = await import('~/server/utils/oauth');
    await expect(
      upsertUser({
        id: 'google_missing',
        provider: 'google',
        name: null,
        email: null,
        avatar: null,
        accessToken: null,
        refreshToken: null,
        tokenIssuedAt: 1,
      })
    ).rejects.toThrow('Identity was not persisted');
  });

  it('persists provider tokens ENCRYPTED (not plaintext) and never returns them in the session user', async () => {
    identity.identityRepository.recordLogin.mockResolvedValue({ id: '1'.repeat(24), role: 'gm' });

    const { upsertUser } = await import('~/server/utils/oauth');
    const profile = {
      id: 'google_789',
      provider: 'google' as const,
      name: 'Token User',
      email: 'tok@example.com',
      avatar: null,
      accessToken: 'super-secret-access-token',
      refreshToken: 'super-secret-refresh-token',
      tokenIssuedAt: Date.now(),
    };

    const sessionUser = await upsertUser(profile);

    // The returned SessionUser must NOT carry the provider tokens.
    expect(sessionUser).not.toHaveProperty('accessToken');
    expect(sessionUser).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(sessionUser)).not.toContain('super-secret-access-token');
    expect(JSON.stringify(sessionUser)).not.toContain('super-secret-refresh-token');
    // Identity claims preserved.
    expect(sessionUser).toMatchObject({ id: 'google_789', provider: 'google', role: 'gm' });

    // What is handed to the store must be encrypted (ciphertext/iv/authTag), never the
    // plaintext the provider returned.
    const { oauthTokens } = identity.identityRepository.recordLogin.mock.calls[0][0];
    const persisted = JSON.stringify(oauthTokens);
    expect(persisted).not.toContain('super-secret-access-token');
    expect(persisted).not.toContain('super-secret-refresh-token');
    expect(oauthTokens.accessToken).toHaveProperty('ciphertext');
    expect(oauthTokens.accessToken).toHaveProperty('iv');
    expect(oauthTokens.accessToken).toHaveProperty('authTag');
    expect(oauthTokens.refreshToken).toHaveProperty('ciphertext');
  });

  it('stores null token slots when the provider returned no token', async () => {
    identity.identityRepository.recordLogin.mockResolvedValue({
      id: '1'.repeat(24),
      role: 'player',
    });

    const { upsertUser } = await import('~/server/utils/oauth');
    await upsertUser({
      id: 'apple_001',
      provider: 'apple' as const,
      name: null,
      email: null,
      avatar: null,
      accessToken: null,
      refreshToken: null,
      tokenIssuedAt: Date.now(),
    });

    const { oauthTokens } = identity.identityRepository.recordLogin.mock.calls[0][0];
    expect(oauthTokens.accessToken).toBeNull();
    expect(oauthTokens.refreshToken).toBeNull();
  });
});

describe('revokeToken (reads from encrypted server-side store)', () => {
  beforeEach(async () => {
    vi.resetModules();
    await useIdentity({ id: '1'.repeat(24), role: 'gm' });
    mockConnectDB.mockClear();
    mockIsDBConnected.mockReturnValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sessionUser = (provider: string, id = `${provider}_1`) => ({
    id,
    provider,
    name: null,
    email: null,
    avatar: null,
    role: 'gm',
    tokenIssuedAt: Date.now(),
  });

  /** Encrypt a token the same way upsertUser does, for use as stored fixture. */
  async function storedToken(plaintext: string) {
    const { encryptToken } = await import('~/server/utils/tokenCrypto');
    return encryptToken(plaintext);
  }

  it('decrypts the stored Google token and calls the Google revoke endpoint, then clears tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    storedAccessToken({
      providerId: 'google_123',
      accessToken: await storedToken('google-access-xyz'),
    });

    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('google', 'google_123'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('oauth2.googleapis.com/revoke');
    // The decrypted plaintext token is sent to the provider.
    expect(url).toContain(encodeURIComponent('google-access-xyz'));
    // Tokens cleared after revocation, against the generation that was observed.
    expect(identity.identityRepository.clearTokens).toHaveBeenCalledWith({
      userId: '1'.repeat(24),
      providerId: 'google_123',
      tokenRevision: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('decrypts the stored GitHub token and calls the GitHub token-delete endpoint', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    storedAccessToken({
      providerId: 'github_456',
      accessToken: await storedToken('gh-access-abc'),
    });

    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('github', 'github_456'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method?: string; body?: string }];
    expect(url).toContain('api.github.com/applications/test-client-id/token');
    expect(init.method).toBe('DELETE');
    expect(init.body).toContain('gh-access-abc');
    expect(identity.identityRepository.clearTokens).toHaveBeenCalled();

    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });

  it('keeps the original generation fence after a login during provider revocation', async () => {
    const observedRevision = '11111111-1111-4111-8111-111111111111';
    let revision = observedRevision;
    storedAccessToken({
      providerId: 'google_1',
      tokenRevision: observedRevision,
      accessToken: await storedToken('older-access'),
    });
    globalThis.fetch = vi.fn(async () => {
      // A login lands while the provider request is in flight, installing a newer
      // generation. Clearing must not erase it.
      revision = '22222222-2222-4222-8222-222222222222';
      return { ok: true } as Response;
    });
    identity.identityRepository.clearTokens.mockImplementation(async (fence) =>
      fence.tokenRevision === revision ? 'cleared' : 'stale'
    );
    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('google'));
    expect(identity.identityRepository.clearTokens).toHaveBeenCalledTimes(1);
    expect(identity.identityRepository.clearTokens.mock.calls[0][0].tokenRevision).toBe(
      observedRevision
    );
    expect(identity.identityRepository.readAccessToken).toHaveBeenCalledTimes(1);
  });

  it('does not clear or retry after an uncertain provider request', async () => {
    storedAccessToken({ providerId: 'google_1', accessToken: await storedToken('access') });
    const fetchMock = vi.fn().mockRejectedValue(new Error('Synthetic network interruption'));
    globalThis.fetch = fetchMock;
    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('google'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(identity.identityRepository.clearTokens).not.toHaveBeenCalled();
  });

  it('early-returns without fetch when no token is stored', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    storedAccessToken(null);

    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('google'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(identity.identityRepository.clearTokens).not.toHaveBeenCalled();
  });

  it('early-returns when the account is not found', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    storedAccessToken(null);

    const { revokeToken } = await import('~/server/utils/oauth');
    await revokeToken(sessionUser('google'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when the stored token cannot be decrypted (e.g. rotated SESSION_SECRET)', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    // A well-formed encrypted token whose ciphertext/auth tag have been tampered
    // with: the GCM auth check fails at decrypt time, so decryptToken throws.
    // This simulates the stored ciphertext no longer being decryptable (e.g. the
    // SESSION_SECRET was rotated since the token was persisted).
    const valid = await storedToken('google-access-xyz');
    const tampered = { ...valid, ciphertext: Buffer.from('garbage-ciphertext').toString('base64') };
    storedAccessToken({ providerId: 'google_123', accessToken: tampered });

    const { revokeToken } = await import('~/server/utils/oauth');
    // Logout must proceed gracefully: revokeToken must not throw to its caller.
    await expect(revokeToken(sessionUser('google', 'google_123'))).resolves.toBeUndefined();

    // Decryption failed before any provider call or token clear could happen.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(identity.identityRepository.clearTokens).not.toHaveBeenCalled();
  });
});
