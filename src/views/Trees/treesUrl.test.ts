// src/views/Trees/treesUrl.test.ts
import { describe, expect, it } from 'vitest'
import { liveEdgeRelation, parseEquityRank, parseLens, parseTreeId, resolveNeighborhood, resolveSpecies } from './treesUrl'

describe('treesUrl — stale or junk params are silent no-ops', () => {
  it('lens defaults to explore', () => {
    expect(parseLens(null)).toBe('explore')
    expect(parseLens('equity')).toBe('equity')
    expect(parseLens('safety')).toBe('safety')
    expect(parseLens('turnover')).toBe('explore')
  })
  it('equity rank defaults to per resident', () => {
    expect(parseEquityRank(null)).toBe('perK')
    expect(parseEquityRank('perKm2')).toBe('perKm2')
    expect(parseEquityRank('falls')).toBe('perK')
  })
  it('tree id is a positive integer or nothing', () => {
    expect(parseTreeId('92401')).toBe(92401)
    for (const v of [null, '', '0', '-3', '12.5', 'TRE-5', '9e9', 'abc']) expect(parseTreeId(v), String(v)).toBeNull()
  })
  it('species must match a published string exactly', () => {
    const names = ['Platanus x hispanica :: Sycamore, London Plane', 'Acer buergerianum']
    expect(resolveSpecies('Acer buergerianum', names)).toBe('Acer buergerianum')
    expect(resolveSpecies('acer buergerianum', names)).toBeNull()
    expect(resolveSpecies(null, names)).toBeNull()
  })
  it('neighborhood must be one of the loaded names', () => {
    expect(resolveNeighborhood('Mission', ['Mission', 'Marina'])).toBe('Mission')
    expect(resolveNeighborhood('Narnia', ['Mission'])).toBeNull()
  })
})

describe('liveEdgeRelation — the live inventory edge against the snapshot date', () => {
  it('later / same / earlier, compared as SF-local date text', () => {
    expect(liveEdgeRelation('2026-09-30', '2026-10-02T03:10:00.000')).toBe('later')
    expect(liveEdgeRelation('2026-09-30', '2026-09-30T23:59:59.000')).toBe('same')
    expect(liveEdgeRelation('2026-09-30', '2026-09-29T08:00:00.000')).toBe('earlier')
  })
  it('a probe that has not answered, failed or returned junk is missing', () => {
    for (const v of [null, undefined, '', 'yesterday']) expect(liveEdgeRelation('2026-09-30', v), String(v)).toBe('missing')
  })
})
