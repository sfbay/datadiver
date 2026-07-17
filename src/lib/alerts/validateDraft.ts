// src/lib/alerts/validateDraft.ts
// Pure request validation for /api/alerts/subscribe — in src/lib so it is
// unit-testable beside the other alerts pure modules, and so its stream and
// category vocabularies come from the existing single sources
// (ALERT_STREAMS registry, significance CATEGORIES) instead of drifting
// copies.
// Relative (not '@/') on purpose: this module is bundled into the Vercel API
// functions, and this is the chain's only RUNTIME value import from types —
// the '@/' alias has no deployed precedent outside erased `import type`s.
import { ALERT_STREAM_IDS, type AlertStreamId } from './streams.js'
import { SIGNIFICANCE_KEYS } from './significance.js'
import { ALERT_RADII } from './radii.js'
import type { SubscriptionDraft } from './types'

const MAX_LOCATIONS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// SF bounding box (loose) — rejects obviously bogus coordinates.
const SF = { latMin: 37.6, latMax: 37.85, lngMin: -123.0, lngMax: -122.3 }

/** Validate an untrusted request body into a SubscriptionDraft, or return a
 *  human-readable error string. NEVER throws — malformed shapes (null array
 *  elements, non-object bodies) must become a 400, not an unhandled 500. */
export function validateDraft(b: unknown): SubscriptionDraft | string {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return 'invalid body'
  const o = b as Record<string, unknown>
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return 'invalid email'

  // Phase 1 ships daily cadence only (cron runs daily).
  if (o.cadence !== 'daily') return 'cadence must be "daily" in this release'

  const f = (typeof o.filters === 'object' && o.filters !== null ? o.filters : {}) as Record<string, unknown>
  // Set-dedup: duplicate entries are accepted client bugs, not errors — but
  // they must not double-fetch or double-count digest events downstream.
  const streams = [...new Set(Array.isArray(f.streams) ? (f.streams as unknown[]) : [])]
  if (streams.length === 0 || !streams.every((s) => (ALERT_STREAM_IDS as string[]).includes(s as string)))
    return 'pick at least one valid stream'
  const categories = [...new Set(Array.isArray(f.categories) ? (f.categories as unknown[]) : [])]
  if (!categories.every((c) => SIGNIFICANCE_KEYS.includes(c as string))) return 'invalid category'

  // Default ON: an absent flag (old clients, hand-rolled curl) opts in;
  // only an explicit false opts out (Jesse, 2026-07-16).
  const pulse = typeof f.pulse === 'boolean' ? f.pulse : true

  const radiusMiles = Number(o.radiusMiles)
  if (!ALERT_RADII.includes(radiusMiles)) return 'invalid radius'

  const locs = Array.isArray(o.locations) ? (o.locations as unknown[]) : []
  if (locs.length < 1 || locs.length > MAX_LOCATIONS) return 'pick 1–10 locations'
  const locations: SubscriptionDraft['locations'] = []
  for (const l of locs) {
    if (typeof l !== 'object' || l === null) return 'invalid location'
    const lo = l as Record<string, unknown>
    const lat = Number(lo.lat)
    const lng = Number(lo.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'invalid coordinates'
    if (lat < SF.latMin || lat > SF.latMax || lng < SF.lngMin || lng > SF.lngMax)
      return 'locations must be within San Francisco'
    locations.push({ label: typeof lo.label === 'string' ? lo.label.slice(0, 80) : undefined, lat, lng })
  }

  const name = typeof o.name === 'string' ? o.name.slice(0, 80) : undefined
  return {
    email,
    name,
    cadence: 'daily',
    filters: { streams: streams as AlertStreamId[], categories: categories as string[], pulse },
    radiusMiles,
    locations,
  }
}
