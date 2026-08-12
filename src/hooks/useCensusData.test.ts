// src/hooks/useCensusData.test.ts
import { describe, it, expect } from 'vitest'
import { selectCensusJson, loadTracts } from './useCensusData'
import { CITIES } from '@/cities/registry'
import type { CityId } from '@/cities/routing'

describe('selectCensusJson', () => {
  it('sf selects the 41-neighborhood JSONs', () => {
    const { neighborhoods } = selectCensusJson('sf')
    expect(neighborhoods).toHaveLength(41)
    expect(neighborhoods.some((n) => n.name === 'Mission')).toBe(true)
  })

  it('oakland selects the 10 region rows keyed by region CODE', () => {
    const { neighborhoods } = selectCensusJson('oakland')
    expect(neighborhoods).toHaveLength(10)
    expect(neighborhoods.map((n) => n.name).sort()).toEqual(
      ['C', 'CE', 'E', 'F', 'L', 'N', 'NW', 'S', 'SE', 'W'],
    )
  })

  it('every registered city has its OWN payload — a new city cannot fall through to SF', () => {
    const ids = Object.keys(CITIES) as CityId[]
    const arrays = ids.map((id) => selectCensusJson(id).neighborhoods)
    expect(new Set(arrays).size).toBe(ids.length)
    for (const rows of arrays) expect(rows.length).toBeGreaterThan(0)
  })
})

describe('the per-city cache', () => {
  it('memoizes each city separately and never serves one city the other city rows', async () => {
    const sfFirst = await loadTracts('sf')
    const sfSecond = await loadTracts('sf')
    const oakland = await loadTracts('oakland')

    // Same city, same cached array — one dynamic import per city per session.
    expect(sfSecond).toBe(sfFirst)
    // Different cities, different cache entries. A single module-level
    // singleton would have handed the second caller the first city's rows.
    expect(oakland).not.toBe(sfFirst)

    // …and the rows really are each county's: 06001 = Alameda, 06075 = SF.
    expect(oakland.every((t) => t.geoId.startsWith('06001'))).toBe(true)
    expect(sfFirst.every((t) => t.geoId.startsWith('06075'))).toBe(true)
  })
})
