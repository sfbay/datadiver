// src/views/Trees/equityView.ts
//
// The Equity lens's pure math: the ranked list, the choropleth's quantile
// stops, and the citywide medians the rail's chips print. Pure and
// node-testable.
//
// Two measures, side by side (spec §10.2): street trees per 1,000 residents
// and per square kilometer. Each row carries its rank under BOTH, so the list
// can print the other measure's rank beside the active one and the flip
// (Tenderloin low per resident, mid per area; Bayview the reverse) is visible
// without switching.
//
// Flagged neighborhoods (parkland, almost no inventory, under 2,000
// residents) are LISTED, never ranked: no position, no influence on the
// stops or the medians, last in name order. Census figures are `null` when
// the ACS row lacks them — skipped, never read as zero.

import type { NeighborhoodAggregate } from '@/lib/trees/types'
import type { EquityRank } from './treesUrl'

export const OTHER_MEASURE: Readonly<Record<EquityRank, EquityRank>> = { perK: 'perKm2', perKm2: 'perK' }

export interface RankedRow extends NeighborhoodAggregate {
  /** The active measure's figure (`perK` or `perKm2`). */
  value: number
  /** 1-based rank among unflagged rows (ties share the lower number); null when flagged. */
  position: number | null
  /** The same row's rank under the OTHER measure; null when flagged. */
  otherPosition: number | null
}

const byNameThen = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Unflagged rows sorted by `by` descending (ties by name), with competition
 *  positions: equal figures share the lower number, the next skips ahead. */
function ordered(rows: readonly NeighborhoodAggregate[], by: EquityRank): { row: NeighborhoodAggregate; position: number }[] {
  const sorted = rows.filter((r) => r.flag === null).sort((a, b) => b[by] - a[by] || byNameThen(a, b))
  const out: { row: NeighborhoodAggregate; position: number }[] = []
  sorted.forEach((row, i) => {
    const prev = out[i - 1]
    out.push({ row, position: prev && prev.row[by] === row[by] ? prev.position : i + 1 })
  })
  return out
}

export function rankNeighborhoods(rows: readonly NeighborhoodAggregate[], by: EquityRank): RankedRow[] {
  const other = new Map(ordered(rows, OTHER_MEASURE[by]).map((o) => [o.row.name, o.position]))
  const ranked: RankedRow[] = ordered(rows, by).map(({ row, position }) => ({
    ...row, value: row[by], position, otherPosition: other.get(row.name) ?? null,
  }))
  const flagged: RankedRow[] = rows
    .filter((r) => r.flag !== null)
    .sort(byNameThen)
    .map((row) => ({ ...row, value: row[by], position: null, otherPosition: null }))
  return [...ranked, ...flagged]
}

// ── the choropleth ─────────────────────────────────────────────────────────

/** Five moss steps for the LIGHT theme, fewest street trees → most: pale to
 *  deep, so on the cream basemap more trees read as more ink. */
export const MOSS_RAMP = ['#e6efd6', '#c9dba8', '#9bb37c', '#7a9954', '#4f6b33'] as const
/** The DARK theme's five steps, fewest → most: lightness REVERSED (ruling
 *  R15). On the espresso basemap the pale end is the brightest fill, so the
 *  light ramp made "fewest" the loudest neighborhood; here fewest is a dim
 *  olive and most is bright. */
export const MOSS_RAMP_DARK = ['#4f6b33', '#7a9954', '#9db87a', '#c9dba8', '#e6efd6'] as const

/** The ramp for a theme, fewest → most. */
export function mossRamp(dark: boolean): readonly string[] {
  return dark ? MOSS_RAMP_DARK : MOSS_RAMP
}

/** Five quantile steps over the UNFLAGGED values: each stop is the value at
 *  the 0 / 20 / 40 / 60 / 80% position of the sorted list (nearest rank,
 *  lower), paired with the THEME's ramp colour (fewest first). The map's
 *  fill and the legend both call this with the same theme, so they cannot
 *  drift. Non-decreasing; empty when nothing is unflagged. */
export function choroplethStops(rows: readonly NeighborhoodAggregate[], by: EquityRank, dark: boolean): [number, string][] {
  const values = rows.filter((r) => r.flag === null).map((r) => r[by]).sort((a, b) => a - b)
  const n = values.length
  if (n === 0) return []
  const ramp = mossRamp(dark)
  return ramp.map((color, i): [number, string] => [values[Math.floor((i * n) / ramp.length)], color])
}

/** The colour of the highest stop at or below `value`; below the first stop
 *  clamps to the first (fewest) step. */
export function stopColor(value: number, stops: readonly (readonly [number, string])[]): string {
  let color = stops[0]?.[1] ?? MOSS_RAMP[0]
  for (const [threshold, c] of stops) if (value >= threshold) color = c
  return color
}

// ── citywide figures (unflagged only) ──────────────────────────────────────

type MedianKey = EquityRank | 'medianIncome'

const unflaggedValues = (rows: readonly NeighborhoodAggregate[], key: MedianKey): number[] =>
  rows
    .filter((r) => r.flag === null)
    .map((r) => r[key])
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b)

/** How many neighborhoods carry no flag — the N in every "Among the N
 *  neighborhoods without a flag" sentence. Counted from the rows themselves,
 *  never read from `equity.n` (that is the link measurement's own count). */
export function unflaggedCount(rows: readonly NeighborhoodAggregate[]): number {
  return rows.filter((r) => r.flag === null).length
}

/** The citywide median of `key` across unflagged neighborhoods — the middle
 *  value, or the mean of the middle two. Null when nothing qualifies. */
export function unflaggedMedian(rows: readonly NeighborhoodAggregate[], key: MedianKey): number | null {
  const v = unflaggedValues(rows, key)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** [min, max] of `key` across unflagged neighborhoods, or null. */
export function unflaggedRange(rows: readonly NeighborhoodAggregate[], key: MedianKey): [number, number] | null {
  const v = unflaggedValues(rows, key)
  return v.length ? [v[0], v[v.length - 1]] : null
}
