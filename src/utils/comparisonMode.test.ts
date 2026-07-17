import { describe, it, expect } from 'vitest'
import {
  addDays, rangeLengthDays, sameDayLastYear,
  resolveComparisonStart, resolveComparisonRange,
  describeWindow, comparisonLabel,
  serializeComparison, parseComparison,
  type ComparisonMode,
} from './comparisonMode'

describe('addDays', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29') // leap year
  })
})

describe('rangeLengthDays', () => {
  it('is 0 for a single-day range', () => {
    expect(rangeLengthDays({ start: '2026-07-04', end: '2026-07-04' })).toBe(0)
  })
  it('is 6 for a 7-day range', () => {
    expect(rangeLengthDays({ start: '2026-07-01', end: '2026-07-07' })).toBe(6)
  })
})

describe('sameDayLastYear', () => {
  it('returns the same calendar day previous year', () => {
    expect(sameDayLastYear('2026-07-04')).toBe('2025-07-04')
  })
  it('clamps Feb 29 to Feb 28 on non-leap target years', () => {
    expect(sameDayLastYear('2024-02-29')).toBe('2023-02-28')
  })
})

describe('resolveComparisonStart / resolveComparisonRange', () => {
  const jul4: { start: string; end: string } = { start: '2026-07-04', end: '2026-07-04' }
  const week: { start: string; end: string } = { start: '2026-07-01', end: '2026-07-07' }

  it('null mode resolves to null', () => {
    expect(resolveComparisonStart(null, jul4)).toBeNull()
    expect(resolveComparisonRange(null, jul4)).toBeNull()
  })
  it('1yr is calendar-anchored, not 360 days', () => {
    expect(resolveComparisonStart({ kind: 'preset', preset: '1yr' }, jul4)).toBe('2025-07-04')
  })
  it('prev shifts back by the range\'s own length', () => {
    expect(resolveComparisonRange({ kind: 'preset', preset: 'prev' }, jul4))
      .toEqual({ start: '2026-07-03', end: '2026-07-03' })
    expect(resolveComparisonRange({ kind: 'preset', preset: 'prev' }, week))
      .toEqual({ start: '2026-06-24', end: '2026-06-30' })
  })
  it('fixed-day presets keep their offsets', () => {
    expect(resolveComparisonStart({ kind: 'preset', preset: '30d' }, jul4)).toBe('2026-06-04')
    expect(resolveComparisonStart({ kind: 'preset', preset: '90d' }, jul4)).toBe('2026-04-05')
    expect(resolveComparisonStart({ kind: 'preset', preset: '180d' }, jul4)).toBe('2026-01-05')
  })
  it('pinned dates pass through and window length matches the range', () => {
    expect(resolveComparisonRange({ kind: 'date', start: '2024-07-04' }, week))
      .toEqual({ start: '2024-07-04', end: '2024-07-10' })
  })
})

describe('describeWindow / comparisonLabel', () => {
  it('single day: AP month + day + year', () => {
    expect(describeWindow({ start: '2025-07-04', end: '2025-07-04' })).toBe('July 4, 2025')
    expect(describeWindow({ start: '2025-01-04', end: '2025-01-04' })).toBe('Jan. 4, 2025')
    expect(describeWindow({ start: '2025-09-04', end: '2025-09-04' })).toBe('Sept. 4, 2025')
  })
  it('same-month span uses an en dash between days', () => {
    expect(describeWindow({ start: '2025-07-04', end: '2025-07-10' })).toBe('July 4–10, 2025')
  })
  it('cross-month span repeats the month', () => {
    expect(describeWindow({ start: '2025-06-28', end: '2025-07-04' })).toBe('June 28 – July 4, 2025')
  })
  it('cross-year span repeats the year', () => {
    expect(describeWindow({ start: '2025-12-30', end: '2026-01-02' })).toBe('Dec. 30, 2025 – Jan. 2, 2026')
  })
  it('comparisonLabel prefixes "vs" and is empty when off', () => {
    const jul4 = { start: '2026-07-04', end: '2026-07-04' }
    expect(comparisonLabel({ kind: 'preset', preset: '1yr' }, jul4)).toBe('vs July 4, 2025')
    expect(comparisonLabel(null, jul4)).toBe('')
  })
})

describe('serializeComparison / parseComparison', () => {
  it('round-trips presets and pinned dates', () => {
    const preset: ComparisonMode = { kind: 'preset', preset: '1yr' }
    const pinned: ComparisonMode = { kind: 'date', start: '2024-07-04' }
    expect(parseComparison(serializeComparison(preset))).toEqual(preset)
    expect(parseComparison(serializeComparison(pinned))).toEqual(pinned)
    expect(serializeComparison(null)).toBeNull()
  })
  it('migrates legacy numeric params to the nearest preset', () => {
    expect(parseComparison('30')).toEqual({ kind: 'preset', preset: '30d' })
    expect(parseComparison('90')).toEqual({ kind: 'preset', preset: '90d' })
    expect(parseComparison('180')).toEqual({ kind: 'preset', preset: '180d' })
    expect(parseComparison('360')).toEqual({ kind: 'preset', preset: '1yr' })
    expect(parseComparison('45')).toEqual({ kind: 'preset', preset: '30d' })
    expect(parseComparison('300')).toEqual({ kind: 'preset', preset: '1yr' })
  })
  it('rejects garbage', () => {
    expect(parseComparison(null)).toBeNull()
    expect(parseComparison('')).toBeNull()
    expect(parseComparison('bogus')).toBeNull()
    expect(parseComparison('-30')).toBeNull()
  })
})
