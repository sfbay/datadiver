import { describe, it, expect } from 'vitest'
import { snapBrushToRange, rangeToYearSpan, parseYearCounts, ERA_START_YEAR } from './eraStripMath'

describe('eraStripMath', () => {
  it('snaps fractional brush to whole-year boundaries', () => {
    expect(snapBrushToRange(2013.4, 2016.6, '2026-07-30'))
      .toEqual({ start: '2013-01-01', end: '2016-12-31' })
  })
  it('clamps end to today and start to era start', () => {
    expect(snapBrushToRange(1990.2, 2026.9, '2026-07-30'))
      .toEqual({ start: `${ERA_START_YEAR}-01-01`, end: '2026-07-30' })
  })
  it('single-year click (x0 ≈ x1) selects that year', () => {
    expect(snapBrushToRange(2020.1, 2020.1, '2026-07-30'))
      .toEqual({ start: '2020-01-01', end: '2020-12-31' })
  })
  it('rangeToYearSpan is inclusive on both ends', () => {
    expect(rangeToYearSpan({ start: '2013-01-01', end: '2016-12-31' })).toEqual({ y0: 2013, y1: 2016 })
    expect(rangeToYearSpan({ start: '2025-06-15', end: '2026-07-30' })).toEqual({ y0: 2025, y1: 2026 })
  })
  it('parseYearCounts drops the null-year row and sorts', () => {
    expect(parseYearCounts([{ yr: '2020', n: '778' }, { n: '4645' } as never, { yr: '1997', n: '2560' }]))
      .toEqual([{ year: 1997, count: 2560 }, { year: 2020, count: 778 }])
  })
})

describe('parseBuyoutYearCounts', () => {
  it('carries the disclosed split, clamped to count', async () => {
    const { parseBuyoutYearCounts } = await import('./eraStripMath')
    expect(parseBuyoutYearCounts([
      { yr: '2026', n: '180', with_amt: '103' },
      { n: '4645' } as never,                        // null-year row dropped
      { yr: '2015', n: '195', with_amt: '999' },     // clamp: disclosed ≤ count
      { yr: '2020', n: '334' },                      // missing with_amt → 0
    ])).toEqual([
      { year: 2015, count: 195, disclosed: 195 },
      { year: 2020, count: 334, disclosed: 0 },
      { year: 2026, count: 180, disclosed: 103 },
    ])
  })
})

describe('ERA_ANNOTATIONS detail', () => {
  it('every annotation carries a non-empty detail line', async () => {
    const { ERA_ANNOTATIONS } = await import('./eraStripMath')
    expect(ERA_ANNOTATIONS).toHaveLength(4)
    for (const a of ERA_ANNOTATIONS) expect(a.detail.length).toBeGreaterThan(10)
  })
})
