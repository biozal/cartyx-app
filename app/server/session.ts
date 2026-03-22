import { SignJWT, jwtVerify } from 'jose'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'

export interface SessionUser {
  id: string
  provider: string
  name: string | null
  email: string | null
  avatar: string | null
  role: string
  accessToken: string | null
  refreshToken: string | null
  tokenIssuedAt: number
}

const COOKIE_NAME = 'cartyx_session'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is not set')
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production')
  }
  return new TextEncoder().encode(secret)
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const token = getCookie(COOKIE_NAME)
    if (!token) return null
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    })
    return (payload as { user: SessionUser }).user ?? null
  } catch {
    return null
  }
}

export async function setSession(user: SessionUser, rememberMe = false): Promise<void> {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSecret())

  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
}

export async function clearSession(): Promise<void> {
  deleteCookie(COOKIE_NAME, { path: '/' })
}
