// src/views/Trees/exploreRows.test.ts
import { describe, expect, it } from 'vitest'
import type { SpeciesAggregate } from '@/lib/trees/types'
import { addressPrefixWhere, barShare, filterSpecies, sharePercent, visibleSpecies } from './exploreRows'

const sp = (name: string, latin: string | null, common: string | null, count: number, rank: number): SpeciesAggregate =>
  ({ name, latin, common, count, rank, trunk: [0, 0, 0, 0], plantedRecorded: 0, plantedYears: null, topNeighborhoods: [] })
const rows = [
  sp('Platanus x hispanica :: Sycamore, London Plane', 'Platanus x hispanica', 'Sycamore, London Plane', 8943, 1),
  sp('Acer buergerianum', 'Acer buergerianum', null, 12, 300),
]

describe('filterSpecies', () => {
  it('matches common or Latin, any case, and keeps rank order', () => {
    expect(filterSpecies(rows, 'plane').map((r) => r.rank)).toEqual([1])
    expect(filterSpecies(rows, 'ACER').map((r) => r.rank)).toEqual([300])
    expect(filterSpecies(rows, '  ')).toHaveLength(2)
    expect(filterSpecies(rows, 'zzz')).toEqual([])
  })
})

describe('addressPrefixWhere — a live prefix match on the address line', () => {
  it('needs a house number and three characters', () => {
    expect(addressPrefixWhere('12')).toBeNull()
    expect(addressPrefixWhere('bush st')).toBeNull()
    expect(addressPrefixWhere('1330 Bush')).toBe("upper(description) like '1330 BUSH%'")
  })
  it('escapes quotes and strips LIKE wildcards', () => {
    expect(addressPrefixWhere("12 O'Farrell%_")).toBe("upper(description) like '12 O''FARRELL%'")
  })
  it('collapses runs of spaces so a double space still matches the published line', () => {
    expect(addressPrefixWhere('  1330   Bush ')).toBe("upper(description) like '1330 BUSH%'")
  })
  it('a query that is only wildcards after the number is not a prefix', () => {
    expect(addressPrefixWhere('12 %%')).toBeNull()
  })
})

describe('visibleSpecies — the first N, and the selected row never hidden', () => {
  const many = Array.from({ length: 100 }, (_, i) => sp(`S${i + 1}`, `S${i + 1}`, null, 100 - i, i + 1))
  it('first N by default, all when shown', () => {
    expect(visibleSpecies(many, false, null, 60)).toHaveLength(60)
    expect(visibleSpecies(many, true, null, 60)).toHaveLength(100)
  })
  it('a selected row past the cut is appended, once', () => {
    const v = visibleSpecies(many, false, 'S80', 60)
    expect(v).toHaveLength(61)
    expect(v[60].name).toBe('S80')
    expect(visibleSpecies(many, false, 'S3', 60)).toHaveLength(60)
  })
  it('a selection not in the rows (filtered out) adds nothing', () => {
    expect(visibleSpecies(many.slice(0, 5), false, 'S80', 60)).toHaveLength(5)
  })
})

describe('sharePercent / barShare', () => {
  it('one decimal; a tiny share is "under 0.1%", never 0.0%', () => {
    expect(sharePercent(8943, 142014)).toBe('6.3%')
    expect(sharePercent(1, 142014)).toBe('<0.1%')
    expect(sharePercent(0, 142014)).toBe('0%')
    expect(sharePercent(5, 0)).toBe('0%')
  })
  it('bars scale to rank 1 and never vanish', () => {
    expect(barShare(8943, 8943)).toBe(1)
    expect(barShare(4471.5, 8943)).toBeCloseTo(0.5)
    expect(barShare(1, 8943)).toBeGreaterThan(0)
    expect(barShare(1, 0)).toBe(0)
  })
})
