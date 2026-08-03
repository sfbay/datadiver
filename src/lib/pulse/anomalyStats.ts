// src/lib/pulse/anomalyStats.ts
// The per-neighborhood anomaly z-score math, extracted from
// useAnomalyBaseline so the SAME arithmetic runs in the browser hook and in
// the digest email's server pulse (api/_lib/pulse.ts). Pure — no React, no
// fetch, no wall-clock reads.
// Runtime imports are relative + .js-suffixed: this module bundles into the
// Vercel API functions (Node ESM resolution).
import type { AnomalyResult, DatasetId } from '../../types/last48.js'
import { sfDayIndex } from '../../hooks/anomalyBaselineWindow.js'

/** Daily GROUP BY row from the baseline query. */
export interface BaselineRow {
  neighborhood: string
  window_start: string // daily-truncated timestamp
  cnt: string
}

/** Minimum windows WITH ACTIVITY for a defensible σ. Counts active windows,
 *  not array length: since bucketDailyCounts zero-fills, every history array
 *  is the full baseline length, so a length gate would admit a neighborhood
 *  that saw events twice in twelve weeks. This preserves exactly the
 *  suppression the pre-zero-fill code applied by accident. */
export const MIN_ACTIVE_WINDOWS = 5

/** A "quiet" reading is only trustworthy if the stream's freshest event is
 *  recent. If a stream hasn't published in over a day, a low 48h count is a
 *  publishing gap, not real quiet (the Quakebot / "crashes −100%" trap).
 *  24h comfortably clears all three live streams' normal cadence. */
export const FRESH_MAX_MS = 24 * 60 * 60 * 1000

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** SAMPLE standard deviation (n−1). Fewer than 2 samples → 0. */
export function stdDev(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

/** Bucket daily counts into 48h-pair counts per neighborhood, ZERO-FILLED
 *  across the whole baseline window and returned in chronological order.
 *  48h bucket = floor(daysSinceEpoch / 2) * 2 — neighbors days into pairs.
 *
 *  The zero-fill is the correctness-critical part. A Socrata GROUP BY emits
 *  NO ROW for a window in which a neighborhood had zero events, so bucketing
 *  only the rows that came back built a baseline out of the busy windows
 *  alone — mean too high, σ too small. computeAnomalies then compared that
 *  against a current count that DOES read missing as 0, so zeros counted on
 *  one side of the comparison and not the other, and an intermittent
 *  neighborhood could publish "unusually quiet" for an ordinary week.
 *
 *  `window` is the same {since, until} that built the query — pass it through
 *  so the fill covers exactly the range that was asked for. Rows outside it
 *  are ignored rather than appended (a widened query must not silently
 *  lengthen some neighborhoods' history and not others'). */
export function bucketDailyCounts(
  rows: BaselineRow[],
  window: { since: string; until: string },
): Record<string, number[]> {
  const startIdx = sfDayIndex(window.since)
  const endIdx = sfDayIndex(window.until)
  if (startIdx === null || endIdx === null || endIdx <= startIdx) return {}

  // Every pair-start in range, chronological. baselineWindow() returns even
  // day indices; floor() keeps this correct for a hand-built odd window too.
  const firstPair = Math.floor(startIdx / 2) * 2
  const pairStarts: number[] = []
  for (let d = firstPair; d < endIdx; d += 2) pairStarts.push(d)
  const slotOf = new Map(pairStarts.map((d, i) => [d, i]))

  const byNeighborhood: Record<string, number[]> = {}
  for (const r of rows) {
    if (!r.neighborhood) continue
    const days = sfDayIndex(r.window_start)
    if (days === null) continue
    const slot = slotOf.get(Math.floor(days / 2) * 2)
    if (slot === undefined) continue // outside the requested window
    const counts = (byNeighborhood[r.neighborhood] ??= new Array(pairStarts.length).fill(0))
    counts[slot] += parseInt(r.cnt, 10)
  }
  return byNeighborhood
}

/** z-scores for one dataset: every baselined neighborhood with enough
 *  history and a nonzero σ, compared against its current 48h count
 *  (missing = 0 — an unusually quiet reading, not an error). */
export function computeAnomalies(
  historical: Record<string, number[]>,
  current: Record<string, number>,
  datasetId: DatasetId,
): AnomalyResult[] {
  const out: AnomalyResult[] = []
  for (const [nh, history] of Object.entries(historical)) {
    // Active windows, not array length — see MIN_ACTIVE_WINDOWS.
    let active = 0
    for (const c of history) if (c > 0) active++
    if (active < MIN_ACTIVE_WINDOWS) continue // not enough N for a defensible σ
    const m = mean(history)
    const sd = stdDev(history, m)
    if (sd === 0) continue // can't divide
    const cur = current[nh] ?? 0
    out.push({
      neighborhood: nh,
      datasetId,
      count48h: cur,
      baselineMean: m,
      baselineSd: sd,
      zScore: (cur - m) / sd,
    })
  }
  return out
}

/** Drop QUIET (negative-z) readings from streams that are behind on
 *  publishing, keeping busy ones. Asymmetric on purpose: events that were
 *  published really happened, so a rise is real regardless of lag — but an
 *  ABSENCE of events is indistinguishable from an absence of publishing, so a
 *  fall from a stale stream is unprovable.
 *
 *  Unknown lag counts as stale: not knowing when a stream last published is
 *  not evidence that it published recently.
 *
 *  Applied centrally (in useAnomalyBaseline) rather than per consumer, because
 *  the gate previously lived only in the Pulse wire while the Last 48 anomaly
 *  choropleth — the wire's own evidence view — had none, so a suppressed card
 *  linked to a map that painted that neighborhood "unusually quiet" anyway. */
export function suppressStaleQuiet<T extends { datasetId: DatasetId | 'combined'; zScore: number }>(
  anomalies: T[],
  freshness: Partial<Record<string, { eventLagMs: number | null } | undefined>>,
): T[] {
  return anomalies.filter((a) => {
    if (a.zScore >= 0) return true
    const lag = freshness[a.datasetId]?.eventLagMs
    return lag != null && lag < FRESH_MAX_MS
  })
}
