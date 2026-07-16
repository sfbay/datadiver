// src/lib/alerts/watermarks.ts
// Pure per-stream watermark arithmetic for the digest cron. A single scalar
// watermark shared across streams let one stream's success discard another's
// backlog (fetch fails on A, B advances the mark past A's unseen events).
import type { AlertEvent } from './streams.js'

export interface WatermarkedSubscription {
  lastEventTs: number
  streamWatermarks: Partial<Record<string, number>>
}

/** The dedup watermark for one stream: the per-stream mark when present,
 *  else the legacy scalar (pre-migration rows carry only last_event_ts). */
export function watermarkFor(sub: WatermarkedSubscription, ds: string): number {
  return sub.streamWatermarks[ds] ?? sub.lastEventTs
}

/** Per-stream watermarks to persist after delivering `matched`: the max
 *  receivedAt per stream, only where it ADVANCES past the current mark —
 *  the jsonb `||` merge overwrites keys, so a regression must never be
 *  emitted here. Streams with no matched events are absent (their marks
 *  stay put and their events remain eligible next run). */
export function nextWatermarks(
  sub: WatermarkedSubscription,
  matched: AlertEvent[],
): Partial<Record<string, number>> {
  const next: Partial<Record<string, number>> = {}
  for (const e of matched) {
    const cur = next[e.datasetId] ?? watermarkFor(sub, e.datasetId)
    if (e.receivedAt > cur) next[e.datasetId] = e.receivedAt
  }
  return next
}
