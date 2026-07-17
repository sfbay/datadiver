import { describe, it, expect } from 'vitest'
import { mean, stdDev, bucketDailyCounts, computeAnomalies, MIN_HISTORY_WINDOWS } from './anomalyStats'

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
  it('sums neighbor days into 48h pairs per neighborhood', () => {
    // 2026-07-06 is an even epoch-day pair-start with 2026-07-07.
    const rows = [
      { neighborhood: 'Mission', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
      { neighborhood: 'Mission', window_start: '2026-07-07T00:00:00.000', cnt: '4' },
      { neighborhood: 'Mission', window_start: '2026-07-08T00:00:00.000', cnt: '10' },
      { neighborhood: 'Castro/Upper Market', window_start: '2026-07-06T00:00:00.000', cnt: '2' },
    ]
    const out = bucketDailyCounts(rows)
    expect(out['Mission'].sort((a, b) => a - b)).toEqual([7, 10])
    expect(out['Castro/Upper Market']).toEqual([2])
  })
  it('skips empty neighborhoods and unparseable dates', () => {
    const out = bucketDailyCounts([
      { neighborhood: '', window_start: '2026-07-06T00:00:00.000', cnt: '3' },
      { neighborhood: 'Mission', window_start: 'garbage', cnt: '3' },
    ])
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
  it(`skips neighborhoods with fewer than ${MIN_HISTORY_WINDOWS} history windows`, () => {
    expect(computeAnomalies({ Mission: [1, 2, 3, 4] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
  it('skips sd === 0 (constant history)', () => {
    expect(computeAnomalies({ Mission: [5, 5, 5, 5, 5] }, { Mission: 9 }, '311-cases')).toEqual([])
  })
})
