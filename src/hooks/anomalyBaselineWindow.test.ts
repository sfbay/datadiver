import { describe, it, expect } from 'vitest'
import { parseSfLocal } from '@/utils/sfTime'
import { baselineWindow, sfDayIndex, BASELINE_PAIRS } from './anomalyBaselineWindow'

const DAY_MS = 24 * 60 * 60 * 1000

describe('sfDayIndex', () => {
  it('indexes by the date part, independent of time-of-day and viewer TZ', () => {
    const expected = Date.UTC(2026, 6, 1) / DAY_MS
    expect(sfDayIndex('2026-07-01T00:00:00.000')).toBe(expected)
    expect(sfDayIndex('2026-07-01T23:59:59')).toBe(expected)
    expect(sfDayIndex('2026-07-01')).toBe(expected)
  })
  it('returns null for garbage', () => {
    expect(sfDayIndex('not a date')).toBeNull()
  })
})

describe('baselineWindow', () => {
  // 2026-07-15 is epoch day 20649 (odd) → current pair starts 20648 (Jul 14);
  // until excludes that pair AND the previous one → 20646 = 2026-07-12.
  const now = parseSfLocal('2026-07-15T23:37:00')

  it('pins exact SF-local midnight bounds for a known instant', () => {
    expect(baselineWindow(now)).toEqual({
      since: '2026-04-19T00:00:00',
      until: '2026-07-12T00:00:00',
    })
  })

  it('spans exactly BASELINE_PAIRS complete day-pairs', () => {
    const { since, until } = baselineWindow(now)
    const span = (sfDayIndex(until)! - sfDayIndex(since)!)
    expect(span).toBe(BASELINE_PAIRS * 2)
    expect(sfDayIndex(since)! % 2).toBe(0)
    expect(sfDayIndex(until)! % 2).toBe(0)
  })

  it('never lets the window reach the live rolling 48h', () => {
    // For ANY hour of the day, `until` must sit at least 48h before `now`
    // could reach back — i.e. untilDay ≤ todayDay − 2.
    for (let h = 0; h < 24; h++) {
      const t = parseSfLocal(`2026-07-15T${String(h).padStart(2, '0')}:30:00`)
      const { until } = baselineWindow(t)
      const todayIdx = sfDayIndex('2026-07-15')!
      expect(sfDayIndex(until)!).toBeLessThanOrEqual(todayIdx - 2)
    }
  })

  it('works across a DST boundary (PST winter instant)', () => {
    const winter = parseSfLocal('2026-01-10T08:00:00')
    const { since, until } = baselineWindow(winter)
    expect(sfDayIndex(until)! - sfDayIndex(since)!).toBe(BASELINE_PAIRS * 2)
    expect(until.endsWith('T00:00:00')).toBe(true)
  })
})
