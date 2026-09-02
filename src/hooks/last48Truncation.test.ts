import { describe, it, expect } from 'vitest'
import {
  LAST48_ROW_CAP,
  windowTotal,
  windowTotalAcross,
  truncationNote,
  cappedLeadingBins,
} from './last48Truncation'

describe('LAST48_ROW_CAP', () => {
  it('is the 5,000-row draw limit (Jesse: keep the newest 5,000 dots, never page)', () => {
    expect(LAST48_ROW_CAP).toBe(5000)
  })
})

describe('windowTotal', () => {
  it('returns the loaded count when the fetch was not capped', () => {
    expect(windowTotal(1234, false, null)).toBe(1234)
    // A stray server total is ignored off the capped path — loaded IS the truth.
    expect(windowTotal(1234, false, 9999)).toBe(1234)
  })
  it('returns the server total when capped', () => {
    expect(windowTotal(5000, true, 5516)).toBe(5516)
  })
  it('is null (ABSENT) when capped and the count query failed — never a guess', () => {
    expect(windowTotal(5000, true, null)).toBeNull()
  })
  it('floors a stale-low server total at the loaded count', () => {
    // Rows held from earlier polls can outnumber a count taken from a
    // slightly different instant; the window can't hold fewer than we drew.
    expect(windowTotal(5300, true, 5100)).toBe(5300)
  })
  it('treats a non-finite server total as absent', () => {
    expect(windowTotal(5000, true, Number.NaN)).toBeNull()
  })
})

describe('windowTotalAcross', () => {
  it('sums loaded counts for uncapped streams (exact)', () => {
    const r = windowTotalAcross([
      { loaded: 3100, truncated: false, serverTotal: null },
      { loaded: 870, truncated: false, serverTotal: null },
      { loaded: 2600, truncated: false, serverTotal: null },
    ])
    expect(r).toEqual({ total: 6570, exact: true })
  })
  it('substitutes the server total for a capped stream (still exact)', () => {
    const r = windowTotalAcross([
      { loaded: 3100, truncated: false, serverTotal: null },
      { loaded: 5000, truncated: true, serverTotal: 5516 },
    ])
    expect(r).toEqual({ total: 8616, exact: true })
  })
  it('is inexact when a capped stream has no server total — loaded count is the floor', () => {
    const r = windowTotalAcross([
      { loaded: 3100, truncated: false, serverTotal: null },
      { loaded: 5000, truncated: true, serverTotal: null },
    ])
    expect(r).toEqual({ total: 8100, exact: false })
  })
  it('handles an empty part list', () => {
    expect(windowTotalAcross([])).toEqual({ total: 0, exact: true })
  })
})

describe('truncationNote', () => {
  it('states loaded-of-total with the oldest-hours caveat when the total is known', () => {
    expect(truncationNote(5000, 5516)).toBe('5,000 loaded of 5,516 · oldest hours not loaded')
  })
  it('states loaded + unavailable when the count query failed', () => {
    expect(truncationNote(5000, null)).toBe('5,000 loaded · window total unavailable')
  })
  it('formats with en-US separators regardless of host locale', () => {
    expect(truncationNote(12345, 67890)).toBe('12,345 loaded of 67,890 · oldest hours not loaded')
  })
  it('is null when explicitly not capped', () => {
    expect(truncationNote(1234, null, false)).toBeNull()
  })
})

describe('cappedLeadingBins', () => {
  const BIN = 2 * 60 * 60 * 1000 // 2h bins, 24 across 48h
  const START = 1_000_000_000_000
  it('is 0 when not truncated, whatever the oldest event', () => {
    expect(cappedLeadingBins({ truncated: false, oldestLoadedMs: START + 10 * BIN, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(0)
  })
  it('counts only bins WHOLLY before the oldest loaded event (3.5 bins in → 3)', () => {
    expect(cappedLeadingBins({ truncated: true, oldestLoadedMs: START + 3.5 * BIN, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(3)
  })
  it('clamps to binCount', () => {
    expect(cappedLeadingBins({ truncated: true, oldestLoadedMs: START + 100 * BIN, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(24)
  })
  it('is 0 when the oldest loaded event sits at or before the window start', () => {
    expect(cappedLeadingBins({ truncated: true, oldestLoadedMs: START, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(0)
    expect(cappedLeadingBins({ truncated: true, oldestLoadedMs: START - BIN, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(0)
  })
  it('is 0 when nothing is loaded (no anchor)', () => {
    expect(cappedLeadingBins({ truncated: true, oldestLoadedMs: null, windowStartMs: START, binMs: BIN, binCount: 24 })).toBe(0)
  })
})
