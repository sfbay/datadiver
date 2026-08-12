// src/views/Demographics/scatterOptions.ts
// Which Census variables the scatter's Y-axis offers, and which of them a given
// city's committed ACS payload can actually plot.
//
// Pure leaf (config + rows in, booleans out) so the coverage facts are pinned
// by test rather than carried in someone's head — see scatterOptions.test.ts,
// which is where the "is this gap city-specific?" question gets answered with
// evidence instead of assumption.

import { CENSUS_VARIABLES } from '@/utils/censusVariables'
import type { NeighborhoodCensusData } from '@/types/census'

/** Census variables offered as scatter Y-axis options. Rates and dollar values
 *  plot naturally against the X variable; the two count-shaped exceptions are
 *  allowlisted by key. Everything else (`format: 'number'` — renterHouseholds,
 *  blockGroupCount, medianAge, …) is deliberately NOT offered. */
export const SCATTER_CENSUS_OPTIONS = CENSUS_VARIABLES.filter(
  v =>
    v.format === 'percent' ||
    v.format === 'currency' ||
    v.key === 'totalPopulation' ||
    v.key === 'populationDensity',
)

/** A scatter needs two points before it means anything. */
export const MIN_SCATTER_POINTS = 2

/** How many of a city's rows carry a finite value for a variable. */
export function coverageCount(
  rows: readonly NeighborhoodCensusData[],
  key: string,
): number {
  let n = 0
  for (const row of rows) {
    const value = (row as unknown as Record<string, unknown>)[key]
    if (typeof value === 'number' && isFinite(value)) n++
  }
  return n
}

/**
 * Can this variable be plotted for these rows at all? False means the city's
 * committed ACS payload publishes nothing for it — the axis would come up
 * empty no matter what the reader picked on the X side, which is a fact the
 * view must SAY rather than leave as a blank frame.
 */
export function isPlottable(
  rows: readonly NeighborhoodCensusData[],
  key: string,
): boolean {
  return coverageCount(rows, key) >= MIN_SCATTER_POINTS
}
