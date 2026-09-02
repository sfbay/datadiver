import { describe, it, expect } from 'vitest'
import {
  LAST48_ROW_CAP,
  COVERAGE_SLACK_MS,
  windowTotal,
  windowTotalAcross,
  truncationNote,
  cappedLeadingBins,
  coverageTruncated,
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

describe('coverageTruncated', () => {
  const H = 60 * 60 * 1000
  const START = 1_000_000_000_000 // the held set's floor (eviction cutoff)
  const base = { drewCap: true, heldCount: 5000, windowStartMs: START, serverTotal: null as number | null }

  it('is never truncated when the draw did not hit the cap', () => {
    expect(coverageTruncated({ ...base, drewCap: false, heldCount: 3100, oldestHeldMs: START + 6 * H })).toBe(false)
  })
  it('is truncated on a cold capped draw whose oldest row sits hours past the window start', () => {
    // 5,000 rows at ~115/hr reach ~42h back: a 6h cut at the far edge.
    expect(coverageTruncated({ ...base, oldestHeldMs: START + 6 * H })).toBe(true)
  })
  it('clears once held rows accumulated across polls reach the window start', () => {
    // A tab left open: every 30-min poll still returns exactly the cap, but
    // the merged hold now starts at the eviction cutoff — nothing is missing.
    expect(coverageTruncated({ ...base, heldCount: 5516, oldestHeldMs: START })).toBe(false)
    expect(coverageTruncated({ ...base, heldCount: 5516, oldestHeldMs: START + 5 * 60 * 1000 })).toBe(false)
  })
  it('treats the slack as inclusive: a gap of exactly the slack is covered, one ms more is not', () => {
    expect(coverageTruncated({ ...base, oldestHeldMs: START + COVERAGE_SLACK_MS })).toBe(false)
    expect(coverageTruncated({ ...base, oldestHeldMs: START + COVERAGE_SLACK_MS + 1 })).toBe(true)
  })
  it('lets a known server total clear the flag when we hold at least that many rows', () => {
    // A genuinely quiet stretch at the window's edge looks like a cut by
    // coverage alone; the count says we have everything.
    expect(coverageTruncated({ ...base, heldCount: 5516, oldestHeldMs: START + 3 * H, serverTotal: 5516 })).toBe(false)
    expect(coverageTruncated({ ...base, heldCount: 5520, oldestHeldMs: START + 3 * H, serverTotal: 5516 })).toBe(false)
  })
  it('stays truncated when the server total exceeds what we hold', () => {
    expect(coverageTruncated({ ...base, heldCount: 5000, oldestHeldMs: START + 3 * H, serverTotal: 5516 })).toBe(true)
  })
  it('a server total can only CLEAR the flag, never set it', () => {
    // Coverage complete but the count (taken seconds later) saw a few newer
    // rows: n > held by timing skew, not by a cut.
    expect(coverageTruncated({ ...base, heldCount: 5514, oldestHeldMs: START, serverTotal: 5516 })).toBe(false)
  })
  it('ignores a non-finite server total', () => {
    expect(coverageTruncated({ ...base, heldCount: 9999, oldestHeldMs: START + 3 * H, serverTotal: Number.NaN })).toBe(true)
  })
  it('is truncated when a capped draw left nothing held (coverage unprovable)', () => {
    expect(coverageTruncated({ ...base, heldCount: 0, oldestHeldMs: null })).toBe(true)
  })
  it('honours a caller-supplied slack', () => {
    expect(coverageTruncated({ ...base, oldestHeldMs: START + 1 * H, slackMs: 2 * H })).toBe(false)
  })
})
