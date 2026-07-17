import { describe, it, expect } from 'vitest'
import type { AnomalyResult } from '@/types/last48'
import { bucketPulse, PULSE_MAX_ROWS } from './pulseDigest'

const NOW = 1_700_000_000_000

function anomaly(p: Partial<AnomalyResult>): AnomalyResult {
  return {
    neighborhood: 'Mission',
    datasetId: '311-cases',
    count48h: 186,
    baselineMean: 90,
    baselineSd: 30,
    zScore: 3.2,
    ...p,
  }
}

describe('bucketPulse', () => {
  it('maps an elevated anomaly to a PulseRow with the evidence link', () => {
    const [row] = bucketPulse([anomaly({})], ['Mission'], NOW)
    expect(row.datasetId).toBe('311-cases')
    expect(row.neighborhood).toBe('Mission')
    expect(row.subject).toBe('311 reports')
    expect(row.magnitude).toBe(3)
    expect(row.ratioLabel).toBe('≈2.1×')
    expect(row.count48h).toBe(186)
    expect(row.factLine).toBe('usual ≈ 90')
    expect(row.href).toBe('/live?nh=Mission&fill=anomaly&points=off')
  })
  it('drops neighborhoods outside the overlap set', () => {
    expect(bucketPulse([anomaly({ neighborhood: 'Sunset/Parkside' })], ['Mission'], NOW)).toEqual([])
  })
  it('drops sub-threshold z (< 1.5)', () => {
    expect(bucketPulse([anomaly({ zScore: 1.2 })], ['Mission'], NOW)).toEqual([])
  })
  it('is busy-only: quiet readings never appear, even extreme ones', () => {
    expect(bucketPulse([anomaly({ zScore: -3.5, count48h: 4 })], ['Mission'], NOW)).toEqual([])
  })
  it('skips combined-score rows', () => {
    expect(bucketPulse([anomaly({ datasetId: 'combined' as AnomalyResult['datasetId'] })], ['Mission'], NOW)).toEqual([])
  })
  it('refuses non-signal streams: a 911 anomaly renders nothing', () => {
    expect(bucketPulse([anomaly({ datasetId: '911-realtime', zScore: 3.0 })], ['Mission'], NOW)).toEqual([])
  })
  it(`ranks by deviation and caps at ${PULSE_MAX_ROWS}`, () => {
    const many = [1.6, 1.7, 1.8, 2.4, 3.0, 2.0].map((z, i) =>
      anomaly({ zScore: z, neighborhood: `NH${i}`, count48h: 100 + i }),
    )
    const rows = bucketPulse(many, many.map((a) => a.neighborhood), NOW)
    expect(rows).toHaveLength(PULSE_MAX_ROWS)
    // Highest z first (rankScore is monotonic in z).
    expect(rows[0].neighborhood).toBe('NH4') // z 3.0
    expect(rows[1].neighborhood).toBe('NH3') // z 2.4
  })
  it('formats big ratios without decimals', () => {
    // mean 0.5, sd 0.2 → z well above floor; ratio 24/0.5 = 48
    const [row] = bucketPulse(
      [anomaly({ count48h: 24, baselineMean: 0.5, baselineSd: 0.2, zScore: 117 })],
      ['Mission'],
      NOW,
    )
    expect(row.ratioLabel).toBe('≈48×')
  })
})
