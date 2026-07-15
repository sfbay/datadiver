/**
 * Pure math for the per-sector closure health signal: current-window closure
 * count vs the SAME calendar window in each of the prior five years. Matched
 * windows sidestep both seasonality and the ~96%-null-NAICS openings bias
 * (closures — older businesses — almost always carry codes).
 */
import { naicsSector } from '@/utils/naicsSector'

/** 'YYYY-MM-DD' minus k years, pure string math (floating dates, no TZ). */
export function shiftYearsStr(dateStr: string, k: number): string {
  const [y, m, d] = dateStr.split('-')
  const year = parseInt(y, 10) - k
  // Feb 29 → Feb 28 when the target year isn't a leap year
  if (m === '02' && d === '29') {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (!leap) return `${year}-02-28`
  }
  return `${year}-${m}-${d}`
}

export interface PrefixRow { p3?: string; cnt: string }

/** Roll 3-digit-prefix count rows up to sector names (null p3 → Uncategorized). */
export function rollupToSectors(rows: PrefixRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const r of rows) {
    const sector = naicsSector(r.p3)
    totals.set(sector, (totals.get(sector) ?? 0) + (parseInt(r.cnt, 10) || 0))
  }
  return totals
}

/**
 * z per sector: (current − mean(samples)) / sd(samples). A sector absent from
 * a sample window genuinely had 0 closures there. sd === 0 → no signal → omit.
 */
export function computeClosureZ(
  current: Map<string, number>,
  samples: Map<string, number>[],
): Map<string, number> {
  const out = new Map<string, number>()
  if (samples.length < 3) return out
  for (const [sector, cur] of current) {
    const vals = samples.map((s) => s.get(sector) ?? 0)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length)
    if (sd > 0) out.set(sector, (cur - mean) / sd)
  }
  return out
}
