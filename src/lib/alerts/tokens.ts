// src/lib/alerts/tokens.ts
// Stateless signed tokens (HMAC-SHA256) — no token table. A token is
// `base64url(payload).base64url(sig)`. Purpose-scoped + expiring.
// Stateless ⇒ NO revocation other than expiry; keep lifetimes short for
// sensitive purposes. Rotating the secret invalidates all outstanding tokens.
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

/**
 * Create a stateless HMAC-signed token: `base64url(payload).base64url(sig)`.
 * `payload.exp` is a Unix timestamp in MILLISECONDS and must be in the future.
 */
export function signToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

/**
 * Verify a signed token. Returns the payload only if the HMAC is valid, the
 * token's own purpose equals `expectedPurpose`, and it has not expired;
 * otherwise returns `null` (never throws). `now` is injectable for testing.
 * `expectedPurpose` is the CALLER's expected purpose — this prevents e.g. a
 * confirm token from being replayed against the unsubscribe endpoint.
 */
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
  if (typeof payload.subjectId !== 'string' || payload.subjectId.length === 0) return null
  if (payload.purpose !== expectedPurpose) return null
  if (!Number.isFinite(payload.exp) || now >= payload.exp) return null
  return payload
}
