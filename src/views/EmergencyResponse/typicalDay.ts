/** Typical-day context for the Incidents card (spec:
 *  2026-07-17-date-anchored-compare §4). Pure — the hook feeds it rows.
 *
 *  Honesty gates: the line renders only for short ranges (≤7 selected days —
 *  a typical-DAY line against a 90-day range is circular) and only when at
 *  least 14 observed days back the average. Absent beats misleading.
 */
import { rangeLengthDays, type DateRange } from '@/utils/comparisonMode'
import { formatNumber } from '@/utils/time'

export interface DailyCountRow {
  day: string
  count: string
}

export function meanDailyCount(rows: DailyCountRow[]): number | null {
  const counts = rows
    .map((r) => parseInt(r.count, 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
  // Mean is over OBSERVED days only — a day with zero rows doesn't appear in
  // the GROUP BY result at all, so it's silently excluded rather than
  // counted as 0. Fine for Fire/EMS (never a true zero day citywide); revisit
  // before reusing this on a sparser dataset where zero days are real.
  if (counts.length < 14) return null
  return counts.reduce((a, b) => a + b, 0) / counts.length
}

export function typicalDayLine(mean: number): string {
  return `typical day ≈ ${formatNumber(Math.round(mean))} calls`
}

export function shouldShowTypicalDay(range: DateRange): boolean {
  return rangeLengthDays(range) <= 6
}
