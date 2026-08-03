import { describe, it, expect } from 'vitest'
import { parseYearCounts, snapBrushToRange, rangeToYearSpan, todayIso } from './eraStrip'

describe('todayIso', () => {
  it('returns YYYY-MM-DD built from local date parts, agreeing with a locally-constructed reference', () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const expected = `${y}-${m}-${day}`
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(todayIso()).toBe(expected)
  })
})

describe('parseYearCounts', () => {
  it('parses and sorts, dropping rows with no year', () => {
    expect(parseYearCounts([
      { yr: '2010', n: '5' },
      { n: '9' },
      { yr: '2004', n: '7' },
    ])).toEqual([{ year: 2004, count: 7 }, { year: 2010, count: 5 }])
  })
})

describe('snapBrushToRange', () => {
  const TODAY = '2026-08-03'
  it('snaps a drag to whole years', () => {
    // round(2011.8) − 1 = 2011, so 2011 is included: the band counts as
    // selected once the brush covers at least half of it.
    expect(snapBrushToRange(2009.4, 2011.8, TODAY, 2003))
      .toEqual({ start: '2009-01-01', end: '2011-12-31' })
  })
  it('a near-zero-width drag selects the single year under the cursor', () => {
    expect(snapBrushToRange(2015.2, 2015.3, TODAY, 2003))
      .toEqual({ start: '2015-01-01', end: '2015-12-31' })
  })
  it('clamps the end to today, never into the future', () => {
    expect(snapBrushToRange(2026.1, 2026.9, TODAY, 2003).end).toBe(TODAY)
  })
  // The reason minYear is a parameter: shared across views with different floors.
  it('clamps the start to the CALLER minYear, not a baked-in constant', () => {
    expect(snapBrushToRange(1998.0, 2005.0, TODAY, 2003).start).toBe('2003-01-01')
    expect(snapBrushToRange(1998.0, 2005.0, TODAY, 1997).start).toBe('1998-01-01')
  })
})

describe('rangeToYearSpan', () => {
  it('reads the year off each end', () => {
    expect(rangeToYearSpan({ start: '2009-03-04', end: '2011-12-31' }))
      .toEqual({ y0: 2009, y1: 2011 })
  })
})
