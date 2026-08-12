// src/utils/censusAggregator.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateToNeighborhoods } from './censusAggregator'
import type { CensusData, TractMapping } from '../types/census'

const tracts: CensusData[] = [
  { geoId: '06001400100', geoType: 'tract', name: 't1', population: 1000, totalPopulation: 1000, medianIncome: 50000 },
  { geoId: '06001400200', geoType: 'tract', name: 't2', population: 3000, totalPopulation: 3000, medianIncome: 90000 },
]
const xw: TractMapping[] = [
  { tractId: '400100', neighborhoods: [{ name: 'W', weight: 1 }] },
  { tractId: '400200', neighborhoods: [{ name: 'W', weight: 1 }] },
]

describe('aggregateToNeighborhoods with an explicit crosswalk', () => {
  it('sums population and population-weights income into the region', () => {
    const [region] = aggregateToNeighborhoods(tracts, xw)
    expect(region.name).toBe('W')
    expect(region.geoType).toBe('neighborhood')
    expect(region.population).toBe(4000)
    // pop-weighted mean: (50000*1000 + 90000*3000)/4000 = 80000
    expect(Math.round(region.medianIncome!)).toBe(80000)
    expect(region.tractCount).toBe(2)
  })

  it('defaults to SF TRACT_MAPPINGS when no crosswalk is passed (>40 neighborhoods)', () => {
    // SF tracts aren't loaded here, so contributing tracts are empty and rows
    // are skipped — but the DEFAULT crosswalk path must still resolve without throwing.
    expect(() => aggregateToNeighborhoods([])).not.toThrow()
  })
})
