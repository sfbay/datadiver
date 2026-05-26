// src/lib/alerts/tokens.ts
// Stateless signed tokens (HMAC-SHA256) — no token table. A token is
// `base64url(payload).base64url(sig)`. Purpose-scoped + expiring.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type TokenPurpose = 'confirm' | 'magic' | 'unsubscribe'

export interface TokenPayload {
  purpose: TokenPurpose
  subjectId: string
  exp: number // unix ms
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  secret: string,
  now: number = Date.now(),
): TokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = sign(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  if (payload.purpose !== expectedPurpose) return null
  if (typeof payload.exp !== 'number' || now > payload.exp) return null
  return payload
}
