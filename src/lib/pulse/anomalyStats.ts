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

/** Minimum history windows for a defensible σ. */
export const MIN_HISTORY_WINDOWS = 5

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

/** Bucket daily counts into 48h-pair counts per neighborhood.
 *  48h bucket = floor(daysSinceEpoch / 2) * 2 — neighbors days into pairs. */
export function bucketDailyCounts(rows: BaselineRow[]): Record<string, number[]> {
  const byNeighborhood: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    if (!r.neighborhood) continue
    const days = sfDayIndex(r.window_start)
    if (days === null) continue
    const bucket = String(Math.floor(days / 2) * 2)
    if (!byNeighborhood[r.neighborhood]) byNeighborhood[r.neighborhood] = {}
    byNeighborhood[r.neighborhood][bucket] =
      (byNeighborhood[r.neighborhood][bucket] ?? 0) + parseInt(r.cnt, 10)
  }
  const historicalCounts: Record<string, number[]> = {}
  for (const [nh, buckets] of Object.entries(byNeighborhood)) {
    historicalCounts[nh] = Object.values(buckets)
  }
  return historicalCounts
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
    if (history.length < MIN_HISTORY_WINDOWS) continue // not enough N for a defensible σ
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
