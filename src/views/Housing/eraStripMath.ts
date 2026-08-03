// Local binding for the `extends YearCount` clause below — the re-export
// statement further down makes YearCount available to importers of this
// module, but re-export syntax alone doesn't bind the name in this file.
import type { YearCount } from '@/utils/eraStrip'

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

// Shared strip arithmetic now lives in src/utils/eraStrip.ts (the header Era
// Track is its second consumer). Re-exported so Housing's imports are unchanged.
export {
  parseYearCounts,
  snapBrushToRange,
  rangeToYearSpan,
  type YearCount,
} from '@/utils/eraStrip'

/** Buyout years carry a disclosed-amount split for the stacked bar
 *  (ochre = amounts entered, gray = pending entry / undisclosed). */
export interface BuyoutYearCount extends YearCount { disclosed: number }

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
