// api/alerts/subscribe.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SubscriptionDraft } from '../../src/lib/alerts/types'
import { ALERT_RADII } from '../../src/lib/alerts/radii.js'
import { signToken } from '../../src/lib/alerts/tokens.js'
import { createPendingSubscription, recordSubscribeAttempt } from '../_lib/db.js'
import { sendConfirmEmail } from '../_lib/email.js'

const STREAMS = ['911-realtime', 'fire-ems-dispatch', '311-cases']
const CATEGORIES = ['shooting', 'stabbing', 'homicide', 'robbery', 'weapon', 'assault', 'fire']
const MAX_PER_IP_PER_HOUR = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// SF bounding box (loose) — rejects obviously bogus coordinates.
const SF = { latMin: 37.6, latMax: 37.85, lngMin: -123.0, lngMax: -122.3 }

function validate(b: unknown): SubscriptionDraft | string {
  if (typeof b !== 'object' || b === null) return 'invalid body'
  const o = b as Record<string, unknown>
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return 'invalid email'

  // Phase 1 ships daily cadence only (cron runs daily).
  if (o.cadence !== 'daily') return 'cadence must be "daily" in this release'

  const f = (o.filters ?? {}) as Record<string, unknown>
  const streams = Array.isArray(f.streams) ? (f.streams as unknown[]) : []
  if (streams.length === 0 || !streams.every((s) => STREAMS.includes(s as string)))
    return 'pick at least one valid stream'
  const categories = Array.isArray(f.categories) ? (f.categories as unknown[]) : []
  if (!categories.every((c) => CATEGORIES.includes(c as string))) return 'invalid category'

  const radiusMiles = Number(o.radiusMiles)
  if (!ALERT_RADII.includes(radiusMiles)) return 'invalid radius'

  const locs = Array.isArray(o.locations) ? (o.locations as unknown[]) : []
  if (locs.length < 1 || locs.length > 10) return 'pick 1–10 locations'
  const locations = locs.map((l) => {
    const lo = l as Record<string, unknown>
    return { label: typeof lo.label === 'string' ? lo.label.slice(0, 80) : undefined, lat: Number(lo.lat), lng: Number(lo.lng) }
  })
  for (const l of locations) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return 'invalid coordinates'
    if (l.lat < SF.latMin || l.lat > SF.latMax || l.lng < SF.lngMin || l.lng > SF.lngMax)
      return 'locations must be within San Francisco'
  }
  const name = typeof o.name === 'string' ? o.name.slice(0, 80) : undefined
  return { email, name, cadence: 'daily', filters: { streams: streams as SubscriptionDraft['filters']['streams'], categories: categories as string[] }, radiusMiles, locations }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const secret = process.env.ALERTS_TOKEN_SECRET
  if (!secret) {
    console.error('[subscribe] ALERTS_TOKEN_SECRET is not set')
    return res.status(500).json({ error: 'server misconfigured' })
  }

  const draft = validate(req.body)
  if (typeof draft === 'string') return res.status(400).json({ error: draft })

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  // Vercel always sets x-forwarded-for; if that ever changes, every caller
  // shares the 'unknown' bucket and the per-IP limit silently becomes a
  // global one. Log loudly so the failure mode is visible.
  if (ip === 'unknown') console.warn('[subscribe] no x-forwarded-for header — rate-limit bucket is global')

  try {
    const attempts = await recordSubscribeAttempt(ip)
    if (attempts > MAX_PER_IP_PER_HOUR) return res.status(429).json({ error: 'too many requests, try later' })

    const { subscriberId } = await createPendingSubscription(draft)
    const token = signToken(
      { purpose: 'confirm', subjectId: subscriberId, exp: Date.now() + 7 * 24 * 3600_000 },
      secret,
    )
    await sendConfirmEmail(draft.email, token)
  } catch (err) {
    console.error('[subscribe] downstream error', err)
    return res.status(503).json({ error: 'service unavailable, try again shortly' })
  }

  // Same response regardless of whether the email was new — no account enumeration.
  return res.status(200).json({ ok: true })
}
