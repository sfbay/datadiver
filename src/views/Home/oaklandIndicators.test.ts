import { describe, it, expect } from 'vitest'
import {
  OAK_TICKER_EDGES,
  completeWindow,
  isStaleLocal,
  apDate,
  crimeCopy,
  threeOneOneCopy,
  citationsCopy,
  cfCopy,
} from './oaklandIndicators'

describe('OAK_TICKER_EDGES (measured 2026-08-07 — see spec §B2 + plan Task 1)', () => {
  it('pins the measured completeness edges', () => {
    expect(OAK_TICKER_EDGES).toEqual({
      crimeEdgeDays: 8,
      crimeSuppressMaxAgeDays: 14,
      threeOneOneEdgeDays: 1,
      threeOneOneSuppressMaxAgeDays: 3,
      citationsEdgeDays: 1,
    })
  })
})

describe('completeWindow', () => {
  it('ends the window edgeDays before max, spanning spanDays date-only days', () => {
    // crime probe fact: max 2026-08-04 → edge 8 → week ending 2026-07-27
    expect(completeWindow('2026-08-04T01:00:00.000', 8, 7)).toEqual({
      start: '2026-07-21',
      end: '2026-07-27',
    })
  })
  it('crosses month boundaries on date math, not string math', () => {
    expect(completeWindow('2026-03-03T12:00:00.000', 3, 7)).toEqual({
      start: '2026-02-22',
      end: '2026-02-28',
    })
  })
})

describe('isStaleLocal', () => {
  const NOW = Date.UTC(2026, 7, 7, 19, 0, 0) // 2026-08-07 noon PT
  it('fresh inside the window, stale outside', () => {
    expect(isStaleLocal('2026-08-04T01:00:00.000', 14, NOW)).toBe(false)
    expect(isStaleLocal('2026-07-01T01:00:00.000', 14, NOW)).toBe(true)
  })
})

describe('apDate', () => {
  it('AP month style via the comparisonMode authority', () => {
    expect(apDate('2026-07-27', 2026)).toBe('July 27')
    expect(apDate('2026-05-15', 2026)).toBe('May 15')
    expect(apDate('2026-08-04', 2026)).toBe('Aug. 4')
    expect(apDate('2026-09-01', 2026)).toBe('Sept. 1')
  })
  it('adds the year only when it differs from now', () => {
    expect(apDate('2025-12-31', 2026)).toBe('Dec. 31, 2025')
  })
})

// The DATE RIDES THE HEADLINE (plan-verify C1: the hero + standard tickers
// never render `detail`, so a detail-borne date would be invisible exactly
// where the landing shows the item). `value` is the bare big-figure
// (C2: TickerCard renders value under the headline — a duplicated headline
// there was the rejected form).
describe('copy builders (self-dating headlines, bare values)', () => {
  it('crime: dated complete week', () => {
    expect(crimeCopy(382, '2026-07-27', 2026)).toEqual({
      headline: '382 crime incidents · week ending July 27',
      value: '382',
    })
  })
  it('311: dated complete week', () => {
    expect(threeOneOneCopy(2149, '2026-08-05', 2026)).toEqual({
      headline: '2,149 311 requests · week ending Aug. 5',
      value: '2,149',
    })
  })
  it('citations: 30 days through the edge date', () => {
    expect(citationsCopy(41876, '2026-05-17', 2026)).toEqual({
      headline: '41,876 parking citations · 30 days through May 17',
      value: '41,876',
    })
  })
  it('campaign finance: names the concluded cycle, no "filed through" claim', () => {
    // $3,993,223.68 is the LIVE Apr-2025 sum under the OAK totals builder's
    // exact WHERE (incl. tran_amt1 > 0 — the earlier $3.93M probe lacked
    // that filter and crosses the toFixed(1) boundary; plan-verify I1).
    expect(cfCopy(3993223.68, 'Apr 2025')).toEqual({
      headline: '$4.0M raised · Apr 2025 cycle',
      value: '$4.0M',
    })
    // pure rounding vectors, not live pins:
    expect(cfCopy(8592930.96, 'Nov 2024').value).toBe('$8.6M')
    expect(cfCopy(950_000, 'Apr 2025').value).toBe('$950K')
  })
})
