import { describe, it, expect } from 'vitest'
import { watermarkFor, nextWatermarks } from './watermarks'
import type { NormalizedEvent } from '@/types/last48'

const ev = (datasetId: string, receivedAt: number): NormalizedEvent =>
  ({ datasetId, receivedAt } as unknown as NormalizedEvent)

describe('watermarkFor', () => {
  it('prefers the per-stream mark', () => {
    expect(watermarkFor({ lastEventTs: 100, streamWatermarks: { '911-realtime': 250 } }, '911-realtime')).toBe(250)
  })
  it('falls back to the legacy scalar for unmigrated rows', () => {
    expect(watermarkFor({ lastEventTs: 100, streamWatermarks: {} }, '311-cases')).toBe(100)
  })
})

describe('nextWatermarks', () => {
  const sub = { lastEventTs: 100, streamWatermarks: { '911-realtime': 500 } as Record<string, number> }
  it('takes the max receivedAt per stream', () => {
    const out = nextWatermarks(sub, [ev('311-cases', 300), ev('311-cases', 900), ev('fire-ems-dispatch', 700)])
    expect(out['311-cases']).toBe(900)
    expect(out['fire-ems-dispatch']).toBe(700)
  })
  it('never moves a watermark backwards (floors at the current mark)', () => {
    const out = nextWatermarks(sub, [ev('911-realtime', 400)])
    expect(out['911-realtime']).toBeUndefined() // 400 < current 500 → no regression written
  })
  it('returns {} for no matches', () => {
    expect(nextWatermarks(sub, [])).toEqual({})
  })
})
