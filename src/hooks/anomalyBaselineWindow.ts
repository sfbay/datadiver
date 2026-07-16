// src/hooks/anomalyBaselineWindow.ts
// Pure window arithmetic for useAnomalyBaseline — extracted so the Socrata
// cutoffs and 48h-pair bucketing are unit-testable and provably SF-local +
// viewer-TZ independent. Fixes three defects of the original inline window:
// a UTC-digit cutoff (started the window 7–8h late), no upper bound (the
// baseline contained today's partial day AND the live 48h window itself),
// and viewer-local day pairing.
import { sfLocalCutoff } from '@/utils/sfTime'

const DAY_MS = 24 * 60 * 60 * 1000

/** 42 non-overlapping 48h windows = 84 days of complete SF day-pairs. */
export const BASELINE_PAIRS = 42

/** Epoch-day index of a floating SF-local timestamp ('2026-07-01T…' or bare
 *  '2026-07-01'). Only the DATE PART is read — 'YYYY-MM-DD' parses as UTC
 *  midnight per spec, so the index is pure calendar arithmetic, identical in
 *  every viewer timezone. */
export function sfDayIndex(ts: string): number | null {
  const ms = Date.parse(ts.slice(0, 10))
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / DAY_MS)
}

/** 'YYYY-MM-DDT00:00:00' for an epoch-day index. Pure index→date arithmetic
 *  via getUTC* on the day's UTC midnight — no wall-clock read anywhere. */
function sfMidnightOfDay(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_MS)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T00:00:00`
}

/** The exact floating-SF-local bounds of the baseline: BASELINE_PAIRS
 *  complete two-day pairs, ending BEFORE any pair that the live rolling 48h
 *  window can touch. `now − 48h` reaches up to three calendar days back, so
 *  both the current pair and the previous one are excluded — the anomaly is
 *  never compared against a baseline that contains it. Use as
 *  `dateField >= since AND dateField < until`. */
export function baselineWindow(nowMs: number): { since: string; until: string } {
  // SF calendar day of "now": take the DATE PART of the SF wall digits.
  const todayIdx = sfDayIndex(sfLocalCutoff(nowMs)) as number
  const currentPairStart = Math.floor(todayIdx / 2) * 2
  const untilIdx = currentPairStart - 2
  const sinceIdx = untilIdx - BASELINE_PAIRS * 2
  return { since: sfMidnightOfDay(sinceIdx), until: sfMidnightOfDay(untilIdx) }
}
