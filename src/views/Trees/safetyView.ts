// src/views/Trees/safetyView.ts
//
// Pure helpers behind the Safety lens's rail (SafetyTab.tsx). Two signals,
// never combined into a score and never a list of individual trees: large
// trunks / stumps per neighborhood, and 311 fall reports by year.
//
// Ruling R1: the citywide year strip shows EVERY year; neighborhood counts
// exist only for years whose reports can be placed (`placeable`), and the
// neighborhood pills offer only those that are also FULL years — a partial
// year beside full ones would read as a drop.

import type { FallYear, NeighborhoodAggregate } from '@/lib/trees/types'

export interface FallBar {
  year: number
  fallen: number
  aboutToFall: number
  partial: boolean
  /** false = shown citywide only (R1). */
  placeable: boolean
  /** The largest `fallen + aboutToFall` across the years: ONE shared scale. */
  max: number
}

/** Every year, ascending, on one scale. The two kinds stay apart. */
export function fallBars(years: readonly FallYear[]): FallBar[] {
  const max = years.reduce((m, y) => Math.max(m, y.fallen + y.aboutToFall), 0)
  return [...years]
    .sort((a, b) => a.year - b.year)
    .map((y) => ({ year: y.year, fallen: y.fallen, aboutToFall: y.aboutToFall, partial: y.partial, placeable: y.placeable, max }))
}

/** The years a neighborhood count can be read for: placeable AND full, ascending. */
export function neighborhoodYears(years: readonly FallYear[]): number[] {
  return years.filter((y) => y.placeable && !y.partial).map((y) => y.year).sort((a, b) => a - b)
}

/** The latest full year (placeable or not) — the opener chip's citywide figure. */
export function latestFullYear(years: readonly FallYear[]): FallYear | null {
  let best: FallYear | null = null
  for (const y of years) if (!y.partial && (best === null || y.year > best.year)) best = y
  return best
}

export interface SafetyRow {
  name: string
  largeTrunks: number
  stumps: number
  fallen: number
  aboutToFall: number
  /** The neighborhood's street trees in the inventory TODAY — printed beside
   *  the reports as a plain figure, never divided into a rate (ruling R17,
   *  reversing R16): a report may concern any tree, park and private trees
   *  included, so the two are different populations. */
  trees: number
}

/** One row per neighborhood for `year`, by that year's fallen-tree reports,
 *  most first; ties by name. `year` must be one of `neighborhoodYears(years)`
 *  — any other year (unplaceable, partial, or absent) returns NO rows, never
 *  a list of zeros that would read as a quiet year. Within a readable year a
 *  neighborhood with no row has 0 of each kind. Counts are reports WITH a map
 *  point only, so a year's rows sum to less than its citywide bar. */
export function safetyRows(nbs: readonly NeighborhoodAggregate[], year: number, years: readonly FallYear[]): SafetyRow[] {
  if (!neighborhoodYears(years).includes(year)) return []
  return nbs
    .map((n) => {
      const cell = n.falls.find((f) => f[0] === year)
      const fallen = cell ? cell[1] : 0
      const aboutToFall = cell ? cell[2] : 0
      return {
        name: n.name,
        largeTrunks: n.largeTrunks,
        stumps: n.stumps,
        fallen,
        aboutToFall,
        trees: n.trees,
      }
    })
    .sort((a, b) => b.fallen - a.fallen || a.name.localeCompare(b.name))
}
