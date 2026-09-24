import { describe, it, expect } from 'vitest'
import {
  parseSeverities, serializeSeverities, severityClause, isPedBikeMode, pedBikeModes,
  toggleExactly, sameSet, parseRankMetric, rankNeighborhoods, DUI_CLAUSE, isDuiCode, PED_BIKE_SQL,
} from './crashFilters'

describe('severity param', () => {
  it('keeps known values, worst first; drops unknown', () => {
    expect([...parseSeverities('Injury (Severe),Fatal,Bogus')]).toEqual(['Fatal', 'Injury (Severe)'])
    expect(parseSeverities(null).size).toBe(0)
  })
  it('round-trips and deletes when empty', () => {
    expect(serializeSeverities(new Set(['Injury (Severe)', 'Fatal']))).toBe('Fatal,Injury (Severe)')
    expect(serializeSeverities(new Set())).toBeNull()
  })
  it('builds one IN clause, or nothing', () => {
    expect(severityClause(new Set(['Fatal']))).toBe("collision_severity IN ('Fatal')")
    expect(severityClause(new Set())).toBe('')
  })
})

describe('ped/bike (the "Bike" bug)', () => {
  // Every mode value the dataset held, probed Sept. 23 2026.
  const MODES = [
    'Vehicle-Bicycle-Pedestrian', 'Unknown/Not Stated', 'Vehicle(s) Only Involved', 'Bicycle-Pedestrian',
    'Pedestrian Only or Pedestrian-Parked Car', 'Bicycle-Parked Car', 'Bicycle-Unknown/Not Stated',
    'Vehicle-Pedestrian', 'Vehicle-Bicycle', 'Bicycle Only',
  ]
  it('counts bicycle modes, which never contain the word "Bike"', () => {
    expect(isPedBikeMode('Vehicle-Bicycle')).toBe(true)
    expect(isPedBikeMode('Bicycle Only')).toBe(true)
    expect(MODES.some((m) => m.includes('Bike'))).toBe(false)
  })
  it('selects exactly the eight ped/bike modes', () => {
    expect(pedBikeModes(MODES).size).toBe(8)
    expect(isPedBikeMode('Vehicle(s) Only Involved')).toBe(false)
    expect(isPedBikeMode('Unknown/Not Stated')).toBe(false)
  })
  it('the SQL names the same two words', () => {
    expect(PED_BIKE_SQL).toContain('%Pedestrian%')
    expect(PED_BIKE_SQL).toContain('%Bicycle%')
  })
})

describe('DUI', () => {
  it('clause and predicate agree', () => {
    expect(DUI_CLAUSE).toBe("vz_pcf_group IN ('23152(a-g)','23153(a-g)')")
    expect(isDuiCode('23153(a-g)')).toBe(true)
    expect(isDuiCode('22350')).toBe(false)
  })
})

describe('toggleExactly (a card click)', () => {
  const fatal = new Set(['Fatal'])
  it('selects the target, or clears when it is already exactly selected', () => {
    expect(sameSet(toggleExactly(new Set(), fatal), fatal)).toBe(true)
    expect(toggleExactly(fatal, fatal).size).toBe(0)
  })
  it('a different selection is replaced, not merged', () => {
    expect([...toggleExactly(new Set(['Injury (Severe)', 'Fatal']), fatal)]).toEqual(['Fatal'])
  })
})

describe('neighborhood ranking', () => {
  const rows = [
    { neighborhood: 'A', crashCount: 50, totalInjured: 60, totalKilled: 0 },
    { neighborhood: 'B', crashCount: 20, totalInjured: 25, totalKilled: 3 },
    { neighborhood: 'C', crashCount: 30, totalInjured: 90, totalKilled: 0 },
  ]
  it('ranks by the chosen metric; ties fall back to crashes', () => {
    expect(rankNeighborhoods(rows, 'crashes').map((r) => r.neighborhood)).toEqual(['A', 'C', 'B'])
    expect(rankNeighborhoods(rows, 'killed').map((r) => r.neighborhood)).toEqual(['B', 'A', 'C'])
    expect(rankNeighborhoods(rows, 'injured').map((r) => r.neighborhood)).toEqual(['C', 'A', 'B'])
  })
  it('unknown param means crashes', () => {
    expect(parseRankMetric('bogus')).toBe('crashes')
    expect(parseRankMetric('killed')).toBe('killed')
  })
})
