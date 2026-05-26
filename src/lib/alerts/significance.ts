// src/lib/alerts/significance.ts
//
// Shared significance helpers for the heartbeat detectors. Pure + tested.

import type { NormalizedEvent } from '@/types/last48'

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

/** Classify an event into a significant category, or null. Excludes 311. */
export function classifySignificant(
  event: NormalizedEvent,
): { key: string; plural: string } | null {
  if (event.datasetId === '311-cases') return null
  const text = event.callType ?? event.headline ?? ''
  for (const c of CATEGORIES) {
    if (c.test.test(text)) return { key: c.key, plural: c.plural }
  }
  return null
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
