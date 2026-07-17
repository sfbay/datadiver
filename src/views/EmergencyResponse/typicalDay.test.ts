import { describe, it, expect } from 'vitest'
import { meanDailyCount, typicalDayLine, shouldShowTypicalDay, type DailyCountRow } from './typicalDay'

const rows = (counts: number[]): DailyCountRow[] =>
  counts.map((c, i) => ({ day: `2026-06-${String(i + 1).padStart(2, '0')}`, count: String(c) }))

describe('meanDailyCount', () => {
  it('averages daily counts', () => {
    expect(meanDailyCount(rows(new Array(20).fill(600)))).toBe(600)
  })
  it('suppresses (null) below 14 observed days — absent beats misleading', () => {
    expect(meanDailyCount(rows(new Array(13).fill(600)))).toBeNull()
    expect(meanDailyCount([])).toBeNull()
  })
  it('ignores unparseable rows', () => {
    const mixed = [...rows(new Array(14).fill(500)), { day: 'x', count: 'NaN' }]
    expect(meanDailyCount(mixed)).toBe(500)
  })
})

describe('typicalDayLine', () => {
  it('phrases the mean in plain English with a rounded figure', () => {
    expect(typicalDayLine(640.4)).toBe('typical day ≈ 640 calls')
    expect(typicalDayLine(1234.6)).toBe('typical day ≈ 1,235 calls')
  })
  it('never uses statistical jargon', () => {
    const BANNED = ['σ', 'sigma', 'z-score', 'standard deviation', 'baseline', 'yoy', 'percentile', 'anomaly', 'periodic']
    const line = typicalDayLine(812).toLowerCase()
    for (const term of BANNED) expect(line).not.toContain(term)
  })
})

describe('shouldShowTypicalDay', () => {
  it('true up to a 7-day range, false beyond', () => {
    expect(shouldShowTypicalDay({ start: '2026-07-04', end: '2026-07-04' })).toBe(true)
    expect(shouldShowTypicalDay({ start: '2026-07-01', end: '2026-07-07' })).toBe(true)
    expect(shouldShowTypicalDay({ start: '2026-07-01', end: '2026-07-08' })).toBe(false)
    expect(shouldShowTypicalDay({ start: '2026-05-01', end: '2026-07-04' })).toBe(false)
  })
})
