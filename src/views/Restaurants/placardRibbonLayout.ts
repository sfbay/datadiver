// src/views/Restaurants/placardRibbonLayout.ts
//
// Layout math for the storefront biography's placard ribbon (spec §4.5 item 2)
// — the x-scale, the year ticks, the two publishing gaps, and the greedy row
// packing that keeps overlapping bars and labels apart. Pure; PlacardRibbon
// only draws what this returns.
//
// Geometry is px (the SVG is a px-fixed layout); TEXT is rem via inline style,
// so a label's px width is estimated here from the live root font size the
// component passes in — Large Type grows the labels, and the packing makes
// room for them.
//
// Dates are 'YYYY-MM-DD' strings. Day numbers come from Date.UTC on the digits
// — never Date.parse of a date-only string (it reads UTC midnight and lands a
// day early on a Pacific host).

import { FEED_BREAK } from './inspectionFeed'

/** The ribbon's fixed left edge: the first month of the 2016–19 score era
 *  (pyih-qa8i's first inspection is 2016-10-04, measured 2026-09-24). */
export const RIBBON_START = '2016-10-01'

/** Where the dotted "feed thins" tick sits — the July 2025 break. */
export const FEED_THINS = FEED_BREAK

/** A stretch the city published no inspections for, [from, to). Edges measured
 *  live on data.sf.gov 2026-09-24:
 *    pyih-qa8i  last inspection 2019-11-28 → 5tti-66ds first 2020-03-09
 *    5tti-66ds  last inspection 2023-08-03 → tvy3-wexg first 2024-01-02
 *  Hatched = "not published", never "no inspections happened". */
export interface PublishingGap {
  from: string
  to: string
}

export const PUBLISHING_GAPS: readonly PublishingGap[] = [
  { from: '2019-11-29', to: '2020-03-09' },
  { from: '2023-08-04', to: '2024-01-02' },
]

/** Whole days since 1970-01-01 for a 'YYYY-MM-DD…' string (digits only). */
export function dayNumber(date: string): number {
  return Math.round(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000,
  )
}

export interface ScaleOpts {
  start: string
  end: string
  /** Left edge of the plotting area, px. */
  left: number
  /** Right edge of the plotting area, px. */
  right: number
}

/** Linear date → x, clamped to [left, right]. A date outside the axis (a
 *  registration that began in 2009, a lane row past asOf) pins to the edge. */
export function ribbonScale(opts: ScaleOpts): (date: string) => number {
  const d0 = dayNumber(opts.start)
  const span = Math.max(1, dayNumber(opts.end) - d0)
  const w = opts.right - opts.left
  return (date: string) => {
    const t = (dayNumber(date) - d0) / span
    return opts.left + Math.min(1, Math.max(0, t)) * w
  }
}

/** Minimum px per year before the ribbon scrolls sideways instead of
 *  squeezing (≈ four characters of axis label plus air). */
export const MIN_PX_PER_YEAR = 40

/** The SVG's width: the container's, or wider when the axis would pack
 *  tighter than `minPxPerYear` — the wrapper then scrolls horizontally. */
export function ribbonWidth(containerPx: number, start: string, end: string, minPxPerYear = MIN_PX_PER_YEAR): number {
  const years = Math.max(0, dayNumber(end) - dayNumber(start)) / 365.25
  return Math.round(Math.max(containerPx, years * minPxPerYear))
}

/** January 1 of every year strictly inside (start, end]. */
export function yearTicks(start: string, end: string): { year: number; date: string }[] {
  const out: { year: number; date: string }[] = []
  for (let y = Number(start.slice(0, 4)) + 1; y <= Number(end.slice(0, 4)); y++) {
    const date = `${y}-01-01`
    if (date > start && date <= end) out.push({ year: y, date })
  }
  return out
}

export interface Span {
  x0: number
  x1: number
}

/**
 * Greedy first-fit row packing: items are placed in x0 order into the first
 * row whose last item ends at least `gap` px before this one starts. Returns
 * the row index for each item, in the ORIGINAL order. With `maxRows`, an item
 * that fits nowhere goes to the row that frees up earliest (overlap is then
 * accepted — a burst of same-week reinspections can't grow the ribbon forever).
 */
export function packRows(items: readonly Span[], gap = 2, maxRows = Infinity): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].x0 - items[b].x0 || items[a].x1 - items[b].x1)
  const rowEnds: number[] = []
  const out = new Array<number>(items.length)
  for (const i of order) {
    const it = items[i]
    let row = rowEnds.findIndex((end) => end + gap <= it.x0)
    if (row === -1) {
      if (rowEnds.length < maxRows) row = rowEnds.length
      else row = rowEnds.reduce((best, end, r) => (end < rowEnds[best] ? r : best), 0)
    }
    rowEnds[row] = Math.max(rowEnds[row] ?? -Infinity, it.x1)
    out[i] = row
  }
  return out
}

/** Rows used by a packing (0 for no items). */
export function rowCount(rows: readonly number[]): number {
  return rows.length ? Math.max(...rows) + 1 : 0
}

/** Estimated px width of a label: characters × font px × an average advance.
 *  0.52 fits Fraunces italic and Roboto Serif at small sizes; Space Mono is
 *  0.6 (monospace advance). An estimate is enough — it only spaces rows. */
export function labelWidth(text: string, fontPx: number, perChar = 0.52): number {
  return Math.ceil(text.length * fontPx * perChar)
}

/** A label's x so it starts at `x0` but never runs off the right edge. */
export function placeLabel(x0: number, width: number, svgWidth: number): number {
  return Math.max(0, Math.min(x0, svgWidth - width))
}

/** The span a labelled bar occupies: the bar itself, or the label if longer. */
export function labelledSpan(x0: number, x1: number, labelPx: number, svgWidth: number): Span {
  const lx = placeLabel(x0, labelPx, svgWidth)
  return { x0: Math.min(x0, lx), x1: Math.max(x1, lx + labelPx) }
}
