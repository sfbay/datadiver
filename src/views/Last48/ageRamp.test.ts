import { describe, it, expect } from 'vitest'
import { COLORS, PAPER_ANCHOR, AGE_BUCKETS, LATENCY_BASELINE_MS, ageBucket, ageColor } from './ageRamp'
import { LAST48_DATASETS } from '@/types/last48'

const H = 60 * 60 * 1000

describe('ageRamp — byte-pinned to the Flow layer values', () => {
  it('stream pigments', () => {
    expect(COLORS).toEqual({ '911-realtime': '#616a96', 'fire-ems-dispatch': '#b85a33', '311-cases': '#7a9954' })
    expect(PAPER_ANCHOR).toBe('#d4c8a8')
  })
  it('bucket stops and latency floors', () => {
    expect(AGE_BUCKETS).toEqual([
      { maxHours: 6, mix: 0 }, { maxHours: 18, mix: 0.45 }, { maxHours: 30, mix: 0.6 }, { maxHours: 48, mix: 0.7 },
    ])
    expect(LATENCY_BASELINE_MS).toEqual({ '911-realtime': 30 * 60 * 1000, 'fire-ems-dispatch': 12 * H, '311-cases': 15 * H })
  })
  it('an event at its stream floor is fresh (full pigment)', () => {
    for (const id of LAST48_DATASETS) {
      expect(ageBucket(id, LATENCY_BASELINE_MS[id]).mix).toBe(0)
      expect(ageColor(id, LATENCY_BASELINE_MS[id])).toBe(COLORS[id])
    }
  })
  it('ages past the last stop stay in the last bucket', () => {
    expect(ageBucket('311-cases', 200 * H).mix).toBe(0.7)
  })
  it('a mixed colour is a hex string that is not the base pigment', () => {
    const c = ageColor('911-realtime', 30 * 60 * 1000 + 10 * H)
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c).not.toBe(COLORS['911-realtime'])
  })
})
