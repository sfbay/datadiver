export const ERA_START_YEAR = 1997

/** Editorial beats verified against annual totals (see spec):
 *  1998 all-time peak 2,917 · 2009 post-crash trough 1,174 ·
 *  2016 Ellis-wave peak 2,134 · 2020 COVID floor 778.
 *  Rendered as hoverable annotation markers (not on-viz text); `detail`
 *  carries the one-line context shown on hover/click. */
export const ERA_ANNOTATIONS = [
  { year: 1998, label: 'Dot-com wave', detail: 'All-time peak: 2,917 notices as the first boom squeezed the rental market' },
  { year: 2009, label: 'Post-crash low', detail: 'Recession trough: 1,174 notices — filings fell with rents' },
  { year: 2016, label: 'Ellis wave', detail: 'Peak of the Ellis Act era: 2,134 notices; buyout disclosure began the year before' },
  { year: 2020, label: 'COVID cliff', detail: 'Eviction moratorium floor: 778 notices, the lowest year on record' },
] as const

export interface YearCount { year: number; count: number }

/** Buyout years carry a disclosed-amount split for the stacked bar
 *  (ochre = amounts entered, gray = pending entry / undisclosed). */
export interface BuyoutYearCount extends YearCount { disclosed: number }

export function parseYearCounts(rows: Array<{ yr?: string; n: string }>): YearCount[] {
  return rows
    .filter((r): r is { yr: string; n: string } => r.yr != null)
    .map((r) => ({ year: Number(r.yr), count: Number(r.n) }))
    .sort((a, b) => a.year - b.year)
}

export function parseBuyoutYearCounts(
  rows: Array<{ yr?: string; n: string; with_amt?: string }>,
): BuyoutYearCount[] {
  return rows
    .filter((r): r is { yr: string; n: string; with_amt?: string } => r.yr != null)
    .map((r) => {
      const count = Number(r.n)
      // Clamp: a Socrata hiccup must never yield disclosed > count.
      const disclosed = Math.min(count, Number(r.with_amt ?? 0) || 0)
      return { year: Number(r.yr), count, disclosed }
    })
    .sort((a, b) => a.year - b.year)
}

const yearOf = (dateStr: string): number => Number(dateStr.slice(0, 4))

/** Year band [y, y+1) counts as selected when the brush covers ≥ half of it.
 *  A near-zero-width brush (click) selects the single year under the cursor. */
export function snapBrushToRange(
  x0: number, x1: number, todayIso: string,
): { start: string; end: string } {
  const maxYear = yearOf(todayIso)
  const startYear = Math.max(ERA_START_YEAR, Math.min(Math.round(x0), maxYear))
  const endYear = x1 > x0 + 0.5
    ? Math.max(startYear, Math.min(Math.round(x1) - 1, maxYear))
    : startYear
  const endStr = `${endYear}-12-31`
  return {
    start: `${startYear}-01-01`,
    end: endStr > todayIso ? todayIso : endStr,
  }
}

export function rangeToYearSpan(range: { start: string; end: string }): { y0: number; y1: number } {
  return { y0: yearOf(range.start), y1: yearOf(range.end) }
}
