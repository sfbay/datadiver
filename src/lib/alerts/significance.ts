// src/lib/alerts/significance.ts
//
// Shared significance helpers for the heartbeat detectors. Pure + tested.

import type { AlertEvent } from './streams.js'

export const BREAKING_WINDOW_MS = 2 * 60_000

/** Significant-incident categories, matched against a call type. Order
 *  matters — first match wins. 311 never qualifies (filtered by caller). */
const CATEGORIES: Array<{ key: string; test: RegExp; plural: string }> = [
  { key: 'shooting', test: /\b(shooting|shots?|gunshot)\b/i, plural: 'shootings' },
  { key: 'stabbing', test: /\b(stab|knife)\b/i,             plural: 'stabbings' },
  { key: 'homicide', test: /\bhomicide\b/i,                 plural: 'homicides' },
  { key: 'robbery',  test: /\brobber/i,                     plural: 'robberies' },
  { key: 'weapon',   test: /\b(gun|firearm|armed|weapon)\b/i, plural: 'weapons calls' },
  { key: 'assault',  test: /\b(assault|batter)\b/i,         plural: 'assaults' },
  { key: 'fire',     test: /\b(structure fire|working fire|vehicle fire|explos)/i, plural: 'fires' },
]

/** The category-key vocabulary, derived from the table above so it can never
 *  drift from the classifier. Shared by the subscribe validator (and, via
 *  400s, effectively pins the builder UI's own category list). */
export const SIGNIFICANCE_KEYS: string[] = CATEGORIES.map((c) => c.key)

/** Classify a raw call-type string into a significant category, or null. The
 *  string-level core of classifySignificant — reusable by surfaces that only
 *  hold a grouped call-type label (e.g. the Home ticker's 48h tally), not a
 *  full NormalizedEvent. */
export function classifyCallType(
  text: string,
): { key: string; plural: string } | null {
  for (const c of CATEGORIES) {
    if (c.test.test(text)) return { key: c.key, plural: c.plural }
  }
  return null
}

/** Classify an event into a significant category, or null. 311 and
 *  business openings never qualify. Crashes qualify on severity — the
 *  Vision Zero dataset is injury-only, so "significant" means fatal or
 *  severe, read from the raw row. `crash-severe` deliberately stays out
 *  of CATEGORIES: it marks rows, it is not a subscriber filter. */
export function classifySignificant(
  event: AlertEvent,
): { key: string; plural: string } | null {
  if (event.datasetId === '311-cases' || event.datasetId === 'business-openings') return null
  if (event.datasetId === 'traffic-crashes') {
    const sev = event.raw?.collision_severity
    const killed = Number(event.raw?.number_killed ?? 0)
    return killed > 0 || sev === 'Fatal' || sev === 'Injury (Severe)'
      ? { key: 'crash-severe', plural: 'severe crashes' }
      : null
  }
  return classifyCallType(event.callType ?? event.headline ?? '')
}

/** 0..30 boost favoring fresh events (linear from full at `now` to 0 at 48h). */
export function recencyBoost(receivedAt: number, now: number): number {
  const ageMs = Math.max(0, now - receivedAt)
  const windowMs = 48 * 3600_000
  const frac = Math.max(0, 1 - ageMs / windowMs)
  return frac * 30
}

/** "8 minutes ago" / "2 hours ago" / "just now". */
export function timeAgo(receivedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - receivedAt) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.floor(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
/** Spell out 0-9 (sentence-leading), digits for 10+. */
export function spellNumber(n: number): string {
  return n >= 0 && n <= 9 ? WORDS[n] : String(n)
}
