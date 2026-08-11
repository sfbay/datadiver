// src/hooks/useCensusData.test.ts
import { describe, it, expect } from 'vitest'
import { selectCensusJson } from './useCensusData'

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

  it('the two cities never share an array (a city can never serve another city rows)', () => {
    expect(selectCensusJson('sf').tracts).not.toBe(selectCensusJson('oakland').tracts)
    expect(selectCensusJson('oakland').tracts.every((t) => t.geoId.startsWith('06001'))).toBe(true)
    expect(selectCensusJson('sf').tracts.every((t) => t.geoId.startsWith('06075'))).toBe(true)
  })
})
