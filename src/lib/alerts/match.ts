// src/lib/alerts/match.ts
// Pure matching logic — the single source of truth for "does this event
// belong in this subscription's digest." Imported by the cron (authoritative
// send decision) and, in Phase 2, by the builder's live preview, so the two
// can never drift. classifySignificant is reused as-is.
import type { AlertEvent } from './streams.js'
import type { Cadence, MatchableSubscription } from './types'
import { classifySignificant } from './significance.js'

const MILES_PER_RADIAN = 3958.7613 // mean Earth radius, miles

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * MILES_PER_RADIAN * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const CADENCE_INTERVAL_MS: Record<Cadence, number> = {
  hourly: 60 * 60_000,
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
}

// Fire a touch early so a cron with scheduling jitter doesn't skip a day.
const DUE_SLACK_MS = 60 * 60_000

export function isSubscriptionDue(
  sub: { cadence: Cadence; lastSentAt: number | null; active: boolean },
  now: number,
): boolean {
  if (!sub.active) return false
  if (sub.lastSentAt == null) return true
  // 1h slack absorbs cron jitter for daily/weekly. Hourly gets none — a 1h
  // slack would collapse its threshold to zero and fire on every tick.
  const slack = sub.cadence === 'hourly' ? 0 : DUE_SLACK_MS
  return now - sub.lastSentAt >= CADENCE_INTERVAL_MS[sub.cadence] - slack
}

export function eventMatchesSubscription(
  event: AlertEvent,
  sub: MatchableSubscription,
  watermarkMs: number,
): boolean {
  if (event.receivedAt <= watermarkMs) return false
  if (!sub.filters.streams.includes(event.datasetId)) return false
  if (event.latitude == null || event.longitude == null) return false
  if (sub.filters.categories.length > 0) {
    const cat = classifySignificant(event)
    if (!cat || !sub.filters.categories.includes(cat.key)) return false
  }
  const pt = { lat: event.latitude, lng: event.longitude }
  return sub.locations.some(
    (loc) => haversineMiles(pt, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
  )
}

/** Matching for released-tier streams: stream + geo + radius ONLY.
 *  No watermark (sent-id memory owns dedup — see sentIds.ts) and no
 *  categories filter (significance categories are a 911/Fire concept;
 *  applying them here would silently blank the released section). */
export function releasedEventMatches(event: AlertEvent, sub: MatchableSubscription): boolean {
  if (!sub.filters.streams.includes(event.datasetId)) return false
  if (event.latitude == null || event.longitude == null) return false
  const pt = { lat: event.latitude, lng: event.longitude }
  return sub.locations.some(
    (loc) => haversineMiles(pt, { lat: loc.lat, lng: loc.lng }) <= sub.radiusMiles,
  )
}
