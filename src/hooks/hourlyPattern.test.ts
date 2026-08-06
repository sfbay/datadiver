import { describe, it, expect } from 'vitest'
import { computeHourlyResult, hourlySelect } from './useHourlyPatternFactory'
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

describe('hourlySelect', () => {
  // A custom countExpr (Oakland crime's count(distinct casenumber)) must
  // actually reach the GROUP BY select — this pins that it does.
  it('carries a custom countExpr through to the select', () => {
    expect(hourlySelect('datetime', 'count(distinct casenumber)')).toContain(
      'count(distinct casenumber)'
    )
  })
  it('matches the legacy SF literal exactly with no countExpr', () => {
    expect(hourlySelect('requested_datetime')).toBe(
      'date_extract_hh(requested_datetime) as hour, date_extract_dow(requested_datetime) as dow, count(*) as call_count'
    )
  })
})

describe('stage-3b hourly extensions', () => {
  it('hourlySelect: SF output BYTE-UNCHANGED with no hourExpr', () => {
    expect(hourlySelect('citation_issued_datetime')).toBe(
      'date_extract_hh(citation_issued_datetime) as hour, date_extract_dow(citation_issued_datetime) as dow, count(*) as call_count'
    )
  })
  it('hourlySelect: hourExpr replaces the extraction, dow keeps the date field', () => {
    expect(hourlySelect('ticket_iss', undefined, "case(x, 'A')")).toBe(
      "case(x, 'A') as hour, date_extract_dow(ticket_iss) as dow, count(*) as call_count"
    )
  })
  it('computeHourlyResult FOLDS multiple buckets into one hour (+= not =)', () => {
    const rows = [
      { hour: '07', dow: '1', call_count: '10' },
      { hour: '7:', dow: '1', call_count: '5' },
    ]
    const map = (raw: string | undefined) =>
      raw == null ? null : parseInt(raw.replace(':', ''), 10)
    const r = computeHourlyResult(rows, false, map)
    expect(r.grid[1][7]).toBe(15)
    expect(r.hourTotals[7]).toBe(15)
    expect(r.unparsedCount).toBe(0)
  })
  it('null-mapped rows land in unparsedCount, not the grid', () => {
    const rows = [
      { hour: '07', dow: '2', call_count: '4' },
      { dow: '2', call_count: '9' }, // Socrata omits the aliased key for the NULL group
    ]
    const map = (raw: string | undefined) => (raw === '07' ? 7 : null)
    const r = computeHourlyResult(rows, false, map)
    expect(r.grid[2][7]).toBe(4)
    expect(r.unparsedCount).toBe(9)
  })
})
