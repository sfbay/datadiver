// src/views/Last48/heartbeat/rank.ts
import type { HeartbeatItem } from '@/types/heartbeat'

export const MAX_ITEMS = 12

/** Patterns (non-event intents) are guaranteed slots first — they're the
 *  "story"; then the highest-scoring events fill the rest. Final order is by
 *  score so a breaking event can still lead. */
export function rankHeartbeatItems(items: HeartbeatItem[], maxItems = MAX_ITEMS): HeartbeatItem[] {
  const byScore = (a: HeartbeatItem, b: HeartbeatItem) => b.score - a.score
  const patterns = items.filter((i) => i.intent?.type !== 'event').sort(byScore)
  const events = items.filter((i) => i.intent?.type === 'event').sort(byScore)

  const chosen = [...patterns]
  for (const e of events) {
    if (chosen.length >= maxItems) break
    chosen.push(e)
  }
  return chosen.sort(byScore).slice(0, maxItems)
}

/** Calm, display-only item for genuinely quiet windows — keeps the ticker
 *  from ever rendering empty. */
export function quietFallback(now: number): HeartbeatItem {
  return {
    id: 'hb-quiet',
    headline: 'All quiet — no significant incidents in the last 48 hours.',
    category: 'milestone',
    severity: 'neutral',
    source: { view: '/live-feeds', label: 'The Last 48' },
    freshness: 'live',
    computedAt: new Date(now),
    priority: 0,
    score: 0,
    intent: { type: 'none' },
  }
}
