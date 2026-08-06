import { describe, it, expect } from 'vitest'
import { computeHourlyResult } from './useHourlyPatternFactory'
import type { HourlyAggRow } from '@/types/datasets'

const row = (hour: number, dow: number, n: number): HourlyAggRow =>
  ({ hour: String(hour), dow: String(dow), call_count: String(n) }) as HourlyAggRow

describe('computeHourlyResult', () => {
  // Oakland crime's date-only cohort files at midnight: hour 0 is the literal
  // max, so an unguarded peak reads "12 AM". The exclusion skips 0 as a PEAK
  // candidate only — the grid and totals keep all 24 hours.
  it('excludePeakHour0 skips hour 0 as peak candidate but keeps its totals', () => {
    const rows = [row(0, 1, 900), row(19, 1, 700), row(9, 2, 500)]
    const guarded = computeHourlyResult(rows, true)
    expect(guarded.peakHour).toBe(19)
    expect(guarded.hourTotals[0]).toBe(900)
    const unguarded = computeHourlyResult(rows, false)
    expect(unguarded.peakHour).toBe(0)
  })
  it('builds the 7x24 grid and finds quietest hour', () => {
    const r = computeHourlyResult([row(3, 0, 1), row(12, 6, 40)])
    expect(r.grid[6][12]).toBe(40)
    expect(r.peakHour).toBe(12)
    expect(r.hourTotals.reduce((a, b) => a + b, 0)).toBe(41)
  })
})
