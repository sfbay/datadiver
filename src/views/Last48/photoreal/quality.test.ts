import { describe, it, expect } from 'vitest'
import { QUALITY_DEFAULT, QUALITY_RANGE, normalizeQuality, setQuality, quality } from './quality'

describe('photoreal quality knobs', () => {
  it('defaults are the 2026-09-10 tuning (M3 measured 25–45 fps before)', () => {
    expect(QUALITY_DEFAULT).toEqual({ fpsCap: 30, sseOrbit: 14, resolution: 0.55, foveation: 8, dynamicSse: true })
  })
  it('defaults sit inside their slider ranges', () => {
    for (const k of ['fpsCap', 'sseOrbit', 'resolution', 'foveation'] as const) {
      expect(QUALITY_DEFAULT[k]).toBeGreaterThanOrEqual(QUALITY_RANGE[k].min)
      expect(QUALITY_DEFAULT[k]).toBeLessThanOrEqual(QUALITY_RANGE[k].max)
    }
  })
  it('normalize clamps and ignores junk', () => {
    expect(normalizeQuality({ fpsCap: 500, resolution: 0.1, sseOrbit: NaN, dynamicSse: undefined }))
      .toEqual({ ...QUALITY_DEFAULT, fpsCap: 60, resolution: 0.35 })
  })
  it('setQuality mutates the live object in place (the director reads it later)', () => {
    const ref = quality
    setQuality({ sseOrbit: 20 })
    expect(ref.sseOrbit).toBe(20)
    setQuality({ sseOrbit: QUALITY_DEFAULT.sseOrbit })
  })
})
