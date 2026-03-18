// src/utils/censusAggregator.ts
// Population-weighted rollup functions that aggregate census-tract-level data
// to neighborhood level using the tract-to-neighborhood crosswalk.

import type { CensusData, CensusVariable, NeighborhoodCensusData } from '../types/census'
import { CENSUS_VARIABLES } from './censusVariables'
import { TRACT_MAPPINGS, getAllMappedNeighborhoods } from './tractMapping'

/** Variables that should be summed (not averaged) when aggregating to neighborhoods. */
const COUNT_VARIABLES = new Set<CensusVariable>(['totalPopulation'])

/**
 * Population-weighted average for rate/median variables.
 * Each tract contributes proportional to its population × weight.
 */
export function weightedAvg(
  values: { value: number; population: number; weight: number }[]
): number {
  let totalWeightedValue = 0
  let totalWeightedPop = 0
  for (const { value, population, weight } of values) {
    totalWeightedValue += value * population * weight
    totalWeightedPop += population * weight
  }
  return totalWeightedPop > 0 ? totalWeightedValue / totalWeightedPop : 0
}

/**
 * Weighted sum for count variables (totalPopulation, etc.).
 */
export function weightedSum(
  values: { value: number; weight: number }[]
): number {
  return values.reduce((sum, { value, weight }) => sum + value * weight, 0)
}

/**
 * Round a value based on the variable's format.
 * - 'percent' → 2 decimal places
 * - 'currency' → integer (dollar values)
 * - 'number' | 'density' → integer for counts, 2 decimal places for rates
 */
function roundByFormat(value: number, variable: CensusVariable): number {
  const config = CENSUS_VARIABLES.find(v => v.key === variable)
  if (!config) return Math.round(value)

  switch (config.format) {
    case 'percent':
      return Math.round(value * 100) / 100
    case 'currency':
      return Math.round(value)
    case 'number':
      // totalPopulation and medianAge are integers; density is a rate
      return COUNT_VARIABLES.has(variable) ? Math.round(value) : Math.round(value * 100) / 100
    case 'density':
      return Math.round(value * 100) / 100
    default:
      return Math.round(value)
  }
}

/**
 * Aggregate tract-level Census data to neighborhood level.
 * Uses weighted allocation from tractMapping.ts.
 *
 * Rate/median variables use population-weighted average.
 * Count variables (totalPopulation) use weighted sum.
 *
 * Tracts with zero population are skipped for weighted-average variables
 * to avoid NaN contributions, but still contribute to weighted sums.
 */
export function aggregateToNeighborhoods(
  tracts: CensusData[]
): NeighborhoodCensusData[] {
  // Build a map of 6-digit tractId → CensusData
  // geoId format is '06075XXXXXX' — the last 6 digits are the tract code
  const tractMap = new Map<string, CensusData>()
  for (const tract of tracts) {
    const tractId = tract.geoId.slice(-6)
    tractMap.set(tractId, tract)
  }

  // Get all unique neighborhoods from TRACT_MAPPINGS
  const allNeighborhoods = getAllMappedNeighborhoods()

  // Collect all CensusVariable keys from the registry
  const allVariableKeys: CensusVariable[] = CENSUS_VARIABLES.map(v => v.key)

  const results: NeighborhoodCensusData[] = []

  for (const neighborhood of allNeighborhoods) {
    // Find all tracts that contribute to this neighborhood
    const contributingTracts: { tractId: string; weight: number; tract: CensusData }[] = []
    for (const mapping of TRACT_MAPPINGS) {
      const match = mapping.neighborhoods.find(n => n.name === neighborhood)
      if (!match) continue
      const tract = tractMap.get(mapping.tractId)
      if (!tract) continue
      contributingTracts.push({ tractId: mapping.tractId, weight: match.weight, tract })
    }

    if (contributingTracts.length === 0) continue

    // Aggregate each variable
    const aggregated: Partial<Record<CensusVariable, number>> = {}

    for (const varKey of allVariableKeys) {
      const isCountVar = COUNT_VARIABLES.has(varKey)

      if (isCountVar) {
        // Weighted sum — all tracts contribute regardless of population
        const entries = contributingTracts
          .filter(({ tract }) => tract[varKey] !== undefined && tract[varKey] !== null)
          .map(({ tract, weight }) => ({ value: tract[varKey] as number, weight }))

        if (entries.length > 0) {
          aggregated[varKey] = roundByFormat(weightedSum(entries), varKey)
        }
      } else {
        // Population-weighted average — skip zero-population tracts to avoid NaN
        const entries = contributingTracts
          .filter(({ tract }) =>
            tract[varKey] !== undefined &&
            tract[varKey] !== null &&
            tract.population > 0
          )
          .map(({ tract, weight }) => ({
            value: tract[varKey] as number,
            population: tract.population,
            weight,
          }))

        if (entries.length > 0) {
          aggregated[varKey] = roundByFormat(weightedAvg(entries), varKey)
        }
      }
    }

    // Compute neighborhood-level population from the totalPopulation aggregation
    // If totalPopulation wasn't in the tract data, fall back to summing tract.population × weight
    const neighborhoodPopulation =
      aggregated.totalPopulation ??
      Math.round(
        contributingTracts.reduce(
          (sum, { tract, weight }) => sum + tract.population * weight,
          0
        )
      )

    const result: NeighborhoodCensusData = {
      geoId: `neighborhood_${neighborhood.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      geoType: 'neighborhood',
      name: neighborhood,
      population: neighborhoodPopulation,
      tractCount: contributingTracts.length,
      tracts: contributingTracts.map(({ tractId }) => tractId),
      ...aggregated,
    }

    results.push(result)
  }

  // Return sorted alphabetically by name
  return results.sort((a, b) => a.name.localeCompare(b.name))
}
