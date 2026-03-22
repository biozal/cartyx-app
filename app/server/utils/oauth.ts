import { connectDB, isDBConnected } from '../db/connection'
import { User } from '../db/models/User'
import type { SessionUser } from '../session'
import { providerConfigured } from './helpers'

export { providerConfigured }

export interface OAuthProfile {
  id: string
  provider: string
  name: string | null
  email: string | null
  avatar: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenIssuedAt: number
}

function requireBaseUrl(): string {
  const url = process.env.BASE_URL
  if (!url) throw new Error('BASE_URL environment variable is required for OAuth')
  return url
}

export function buildGoogleOAuthUrl(state?: string): string {
  const baseUrl = requireBaseUrl()
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}/auth/callback/google`,
    response_type: 'code',
    scope: 'openid profile email',
    access_type: 'offline',
    prompt: 'consent',
    ...(state && { state }),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function buildGithubOAuthUrl(state?: string): string {
  const baseUrl = requireBaseUrl()
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${baseUrl}/auth/callback/github`,
    scope: 'user:email',
    ...(state && { state }),
  })
  return `https://github.com/login/oauth/authorize?${params}`
}

export function buildAppleOAuthUrl(state?: string): string {
  const baseUrl = requireBaseUrl()
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}/auth/callback/apple`,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'query',
    ...(state && { state }),
  })
  return `https://appleid.apple.com/auth/authorize?${params}`
}

export async function exchangeAppleCode(code: string): Promise<OAuthProfile> {
  const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH } =
    process.env
  const appleBaseUrl = requireBaseUrl()
  if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY_PATH) {
    throw new Error('Apple OAuth not configured')
  }

  const { readFileSync } = await import('node:fs')
  const privateKey = readFileSync(APPLE_PRIVATE_KEY_PATH, 'utf8')
  const { importPKCS8, jwtVerify, createRemoteJWKSet, SignJWT } = await import('jose')
  const key = await importPKCS8(privateKey, 'ES256')

  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APPLE_KEY_ID })
    .setIssuer(APPLE_TEAM_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(APPLE_CLIENT_ID)
    .sign(key)

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${appleBaseUrl}/auth/callback/apple`,
    }),
  })

  const tokens = (await tokenRes.json()) as {
    id_token?: string
    access_token?: string
    refresh_token?: string
    error?: string
  }
  if (tokens.error || !tokens.id_token) {
    throw new Error(`Apple token exchange failed: ${tokens.error}`)
  }

  const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: APPLE_CLIENT_ID,
  })

  return {
    id: `apple_${payload.sub}`,
    provider: 'apple',
    name: null,
    email: (payload.email as string | undefined) ?? null,
    avatar: null,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    tokenIssuedAt: Date.now(),
  }
}

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${requireBaseUrl()}/auth/callback/google`,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Google token exchange failed (HTTP ${tokenRes.status}): ${body}`)
  }
  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    error?: string
  }
  if (tokens.error || !tokens.access_token) {
    throw new Error(`Google token exchange failed: ${tokens.error ?? 'no access_token returned'}`)
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = (await profileRes.json()) as {
    id: string
    name?: string
    email?: string
    picture?: string
  }

  return {
    id: `google_${profile.id}`,
    provider: 'google',
    name: profile.name ?? null,
    email: profile.email ?? null,
    avatar: profile.picture ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenIssuedAt: Date.now(),
  }
}

export async function exchangeGithubCode(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: `${requireBaseUrl()}/auth/callback/github`,
    }),
  })
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`GitHub token exchange failed (HTTP ${tokenRes.status}): ${body}`)
  }
  const tokens = (await tokenRes.json()) as { access_token?: string; error?: string }
  if (tokens.error || !tokens.access_token) {
    throw new Error(`GitHub token exchange failed: ${tokens.error ?? 'no access_token returned'}`)
  }

  const profileRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  const profile = (await profileRes.json()) as {
    id: number
    name?: string
    email?: string
    avatar_url?: string
  }

  // Fetch emails if not returned in main profile
  let email = profile.email ?? null
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean }>
    email = emails.find(e => e.primary)?.email ?? null
  }

  return {
    id: `github_${profile.id}`,
    provider: 'github',
    name: profile.name ?? null,
    email,
    avatar: profile.avatar_url ?? null,
    accessToken: tokens.access_token,
    refreshToken: null,
    tokenIssuedAt: Date.now(),
  }
}

export async function upsertUser(profile: OAuthProfile): Promise<SessionUser> {
  await connectDB()
  if (!isDBConnected()) return { ...profile, role: 'unknown' }

  try {
    const nameParts = (profile.name ?? '').split(' ')
    const stored = await User.findOneAndUpdate(
      { providerId: profile.id },
      {
        $set: {
          provider: profile.provider,
          providerId: profile.id,
          ...(profile.email && { email: profile.email }),
          ...(profile.name && {
            firstName: nameParts[0] ?? '',
            lastName: nameParts.slice(1).join(' ') ?? '',
          }),
          ...(profile.avatar && { avatarUrl: profile.avatar }),
          lastLoginAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date(), role: 'unknown' },
      },
      { upsert: true, returnDocument: 'after', new: true }
    )
    return {
      ...profile,
      email: profile.email ?? stored?.email ?? null,
      name:
        profile.name ??
        (`${stored?.firstName ?? ''} ${stored?.lastName ?? ''}`.trim() || null),
      avatar: profile.avatar ?? stored?.avatarUrl ?? null,
      role: stored?.role ?? 'unknown',
    }
  } catch {
    return { ...profile, role: 'unknown' }
  }
}

export async function revokeToken(user: SessionUser): Promise<void> {
  if (!user.accessToken) return
  try {
    if (user.provider === 'google') {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(user.accessToken)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
    } else if (user.provider === 'github' && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      const creds = Buffer.from(
        `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
      ).toString('base64')
      await fetch(
        `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${creds}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: user.accessToken }),
        }
      )
    }
  } catch {
    // Token revocation failed — non-fatal, will expire naturally
  }
}
