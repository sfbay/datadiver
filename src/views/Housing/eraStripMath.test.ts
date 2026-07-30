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
