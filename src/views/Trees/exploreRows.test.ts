// src/views/Trees/exploreRows.test.ts
import { describe, expect, it } from 'vitest'
import type { SpeciesAggregate } from '@/lib/trees/types'
import {
  addressPrefixWhere, addressSearchState, barShare, filterSpecies, sharePercent, speciesListRows, visibleSpecies,
} from './exploreRows'

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

describe('speciesListRows — a selected species never vanishes under a search', () => {
  const many = Array.from({ length: 100 }, (_, i) => sp(`S${i + 1}`, `S${i + 1}`, i === 4 ? 'Plane' : null, 100 - i, i + 1))
  it('no search: the selection is in the list (appended past the cut), nothing pinned', () => {
    const r = speciesListRows(many, '', false, 'S80', 60)
    expect(r.pinned).toBeNull()
    expect(r.rows.at(-1)!.name).toBe('S80')
  })
  it('a search that excludes the selection pins it at the top, once', () => {
    const r = speciesListRows(many, 'plane', false, 'S80', 60)
    expect(r.pinned).toBe('S80')
    expect(r.rows.map((x) => x.name)).toEqual(['S80', 'S5'])
    expect(r.matches.map((x) => x.name)).toEqual(['S5'])
  })
  it('a search with no match at all still draws the selection', () => {
    const r = speciesListRows(many, 'zzz', false, 'S3', 60)
    expect(r.matches).toEqual([])
    expect(r.rows.map((x) => x.name)).toEqual(['S3'])
    expect(r.pinned).toBe('S3')
  })
  it('a search that matches the selection pins nothing', () => {
    const r = speciesListRows(many, 'plane', false, 'S5', 60)
    expect(r.pinned).toBeNull()
    expect(r.rows.map((x) => x.name)).toEqual(['S5'])
  })
  it('no selection, or one the list does not hold: nothing pinned', () => {
    expect(speciesListRows(many, 'plane', false, null, 60).pinned).toBeNull()
    expect(speciesListRows(many, 'plane', false, 'Nope', 60)).toMatchObject({ pinned: null, rows: [many[4]] })
  })
})

describe('addressSearchState — rows count only for the query they were stamped with', () => {
  const W1 = "upper(description) like '1330 BUSH%'"
  const W2 = "upper(description) like '1330 BUSH S%'"
  const read = (where: string, rows: string[], error: string | null = null) => ({ where, rows, error })
  it('no address query: not loading, no rows', () => {
    expect(addressSearchState(null, null, read(W1, ['a']))).toEqual({ loading: false, rows: [], error: null })
  })
  it('W1 → W2 → back to W1: a result stamped W1 settles at once (the cached repeat)', () => {
    // W2 was requested but the reader backspaced; the cache answered W1 in a microtask.
    expect(addressSearchState(W1, W1, read(W1, ['1330 Bush St']))).toEqual({ loading: false, rows: ['1330 Bush St'], error: null })
  })
  it('a result stamped for an OLD query while a new one is pending: loading, the old rows hidden', () => {
    expect(addressSearchState(W2, W2, read(W1, ['1330 Bush St']))).toEqual({ loading: true, rows: [], error: null })
  })
  it('still typing toward a new prefix: loading', () => {
    expect(addressSearchState(W2, W1, read(W1, ['x']))).toMatchObject({ loading: true, rows: [] })
  })
  it('first query, nothing settled yet: loading, never "no address"', () => {
    expect(addressSearchState(W1, W1, null)).toEqual({ loading: true, rows: [], error: null })
  })
  it('the typed text is an address but the debounce has not landed: loading', () => {
    expect(addressSearchState(W1, null, null)).toMatchObject({ loading: true, rows: [] })
  })
  it('an error stamped for the current query: not loading, the error shown', () => {
    expect(addressSearchState(W1, W1, read(W1, [], 'timeout'))).toEqual({ loading: false, rows: [], error: 'timeout' })
  })
  it('an empty result stamped for the current query: settled, no rows (the "no address" line)', () => {
    expect(addressSearchState(W1, W1, read(W1, []))).toEqual({ loading: false, rows: [], error: null })
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
