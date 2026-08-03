import { describe, it, expect } from 'vitest'
import {
  mean,
  stdDev,
  bucketDailyCounts,
  computeAnomalies,
  suppressStaleQuiet,
  FRESH_MAX_MS,
  MIN_ACTIVE_WINDOWS,
} from './anomalyStats'
import type { AnomalyResult } from '../../types/last48'

// Four 48h pairs: 07-06/07, 07-08/09, 07-10/11, 07-12/13.
const WINDOW = { since: '2026-07-06T00:00:00', until: '2026-07-14T00:00:00' }

describe('mean / stdDev', () => {
  it('computes the arithmetic mean; empty → 0', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3)
    expect(mean([])).toBe(0)
  })
  it('computes SAMPLE standard deviation (n−1); <2 samples → 0', () => {
    const xs = [1, 2, 3, 4, 5]
    expect(stdDev(xs, mean(xs))).toBeCloseTo(1.5811, 3)
    expect(stdDev([7], 7)).toBe(0)
  })
})

describe('bucketDailyCounts', () => {
  it('sums neighbor days into 48h pairs per neighborhood, in chronological order', () => {
    // 2026-07-06 is an even epoch-day pair-start with 2026-07-07.
    const rows = [
      { neighborhood: 'Mission', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
      { neighborhood: 'Mission', window_start: '2026-07-07T00:00:00.000', cnt: '4' },
      { neighborhood: 'Mission', window_start: '2026-07-08T00:00:00.000', cnt: '10' },
      { neighborhood: 'Castro/Upper Market', window_start: '2026-07-06T00:00:00.000', cnt: '2' },
    ]
    const out = bucketDailyCounts(rows, WINDOW)
    expect(out['Mission']).toEqual([7, 10, 0, 0])
    expect(out['Castro/Upper Market']).toEqual([2, 0, 0, 0])
  })

  // THE BUG THIS FILE EXISTS TO PIN: a GROUP BY emits no row for a window with
  // zero events, so dropping absent buckets built a baseline of only the busy
  // windows — inflating the mean and shrinking σ, which manufactured
  // "unusually quiet" readings for neighborhoods that were merely intermittent.
  it('zero-fills windows the GROUP BY never returned', () => {
    const out = bucketDailyCounts(
      [
        { neighborhood: 'Presidio', window_start: '2026-07-06T00:00:00.000', cnt: '4' },
        { neighborhood: 'Presidio', window_start: '2026-07-12T00:00:00.000', cnt: '2' },
      ],
      WINDOW,
    )
    expect(out['Presidio']).toEqual([4, 0, 0, 2])
    expect(mean(out['Presidio'])).toBe(1.5) // NOT 3 — the two silent zeros count
  })

  it('every neighborhood gets exactly one entry per window in the range', () => {
    const out = bucketDailyCounts(
      [{ neighborhood: 'Mission', window_start: '2026-07-10T00:00:00.000', cnt: '1' }],
      { since: '2026-07-06T00:00:00', until: '2026-08-01T00:00:00' },
    )
    expect(out['Mission']).toHaveLength(13) // 26 days = 13 pairs
    expect(out['Mission'].filter((n) => n > 0)).toEqual([1])
  })

  it('ignores rows outside the window rather than appending them', () => {
    const out = bucketDailyCounts(
      [
        { neighborhood: 'Mission', window_start: '2026-06-01T00:00:00.000', cnt: '99' },
        { neighborhood: 'Mission', window_start: '2026-07-06T00:00:00.000', cnt: '5' },
      ],
      WINDOW,
    )
    expect(out['Mission']).toEqual([5, 0, 0, 0])
  })

  it('skips empty neighborhoods and unparseable dates', () => {
    const out = bucketDailyCounts(
      [
        { neighborhood: '', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
        { neighborhood: 'Mission', window_start: 'garbage', cnt: '3' },
      ],
      WINDOW,
    )
    expect(out).toEqual({})
  })
})

describe('computeAnomalies', () => {
  const history = [8, 10, 12, 10, 10] // m=10, sample sd = sqrt(2)
  it('computes z = (cur − mean) / sd', () => {
    const [a] = computeAnomalies({ Mission: history }, { Mission: 20 }, '311-cases')
    expect(a.neighborhood).toBe('Mission')
    expect(a.datasetId).toBe('311-cases')
    expect(a.count48h).toBe(20)
    expect(a.baselineMean).toBe(10)
    expect(a.zScore).toBeCloseTo(10 / Math.sqrt(2), 4)
  })
  it('missing current count reads as 0 (a quiet reading, not an error)', () => {
    const [a] = computeAnomalies({ Mission: history }, {}, '311-cases')
    expect(a.count48h).toBe(0)
    expect(a.zScore).toBeLessThan(0)
  })
  it(`skips neighborhoods with fewer than ${MIN_ACTIVE_WINDOWS} ACTIVE windows`, () => {
    expect(computeAnomalies({ Mission: [1, 2, 3, 4] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
  // Zero-filling makes every history array the same length, so the old
  // `history.length` gate would pass everything. The gate that actually
  // matters — and the one the pre-zero-fill code was accidentally applying —
  // counts windows with ACTIVITY, so a near-silent area still can't publish.
  it('counts activity, not array length: 40 zeros + 4 active windows is still skipped', () => {
    const sparse = [3, 0, 0, 0, 5, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0]
    expect(computeAnomalies({ Presidio: sparse }, { Presidio: 20 }, '311-cases')).toEqual([])
  })
  it('admits a neighborhood once it has enough active windows, zeros included in σ', () => {
    const history = [3, 0, 5, 0, 2, 0, 4, 1]
    const [a] = computeAnomalies({ Presidio: history }, { Presidio: 3 }, '311-cases')
    expect(a.baselineMean).toBeCloseTo(1.875, 4)
    expect(a.baselineSd).toBeGreaterThan(0)
  })
  it('skips sd === 0 (constant history)', () => {
    expect(computeAnomalies({ Mission: [5, 5, 5, 5, 5] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
})

// A stream that is merely behind on publishing must never read as "unusually
// quiet" (the Quakebot trap). The Pulse wire gated for this; the Last 48
// anomaly choropleth — the wire's own evidence view — did not, so a card
// could be suppressed while the map it linked to painted the same neighborhood
// teal. The gate lives here now so both surfaces inherit it.
describe('suppressStaleQuiet', () => {
  const a = (over: Partial<AnomalyResult>): AnomalyResult => ({
    neighborhood: 'Mission',
    datasetId: '311-cases',
    count48h: 1,
    baselineMean: 10,
    baselineSd: 2,
    zScore: -4,
    ...over,
  })
  const FRESH = { '311-cases': { eventLagMs: 60 * 60 * 1000 } }
  const STALE = { '311-cases': { eventLagMs: FRESH_MAX_MS + 1 } }

  it('drops a quiet reading from a stale stream', () => {
    expect(suppressStaleQuiet([a({})], STALE)).toEqual([])
  })
  it('keeps a quiet reading from a fresh stream', () => {
    expect(suppressStaleQuiet([a({})], FRESH)).toHaveLength(1)
  })
  it('keeps a BUSY reading even from a stale stream — those events really happened', () => {
    expect(suppressStaleQuiet([a({ zScore: 3.2, count48h: 40 })], STALE)).toHaveLength(1)
  })
  it('treats unknown lag as stale — absent evidence is not evidence of freshness', () => {
    expect(suppressStaleQuiet([a({})], { '311-cases': { eventLagMs: null } })).toEqual([])
    expect(suppressStaleQuiet([a({})], {})).toEqual([])
  })
  it('gates per stream, not globally', () => {
    const out = suppressStaleQuiet(
      [a({ datasetId: '311-cases' }), a({ datasetId: '911-realtime' })],
      { '311-cases': { eventLagMs: FRESH_MAX_MS + 1 }, '911-realtime': { eventLagMs: 1000 } },
    )
    expect(out.map((x) => x.datasetId)).toEqual(['911-realtime'])
  })
})
