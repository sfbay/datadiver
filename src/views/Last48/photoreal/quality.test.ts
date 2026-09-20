import { describe, it, expect } from 'vitest'
import { QUALITY_DEFAULT, QUALITY_IMMERSIVE, QUALITY_RANGE, normalizeQuality, resetQuality, setQuality, quality } from './quality'

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

describe('immersive quality (Spec A2 §3)', () => {
  it('defaults are full resolution, finer rest detail, gentler foveation', () => {
    expect(QUALITY_IMMERSIVE).toEqual({ fpsCap: 30, sseOrbit: 12, resolution: 1, foveation: 4, dynamicSse: true })
  })
  it('immersive defaults sit inside the slider ranges', () => {
    for (const k of ['fpsCap', 'sseOrbit', 'resolution', 'foveation'] as const) {
      expect(QUALITY_IMMERSIVE[k]).toBeGreaterThanOrEqual(QUALITY_RANGE[k].min)
      expect(QUALITY_IMMERSIVE[k]).toBeLessThanOrEqual(QUALITY_RANGE[k].max)
    }
  })
  it('resetQuality loads a mode into the live object and returns it', () => {
    setQuality({ sseOrbit: 25 })
    expect(resetQuality(QUALITY_IMMERSIVE)).toBe(quality)
    expect(quality).toEqual(QUALITY_IMMERSIVE)
    resetQuality(QUALITY_DEFAULT)
    expect(quality).toEqual(QUALITY_DEFAULT)
  })
})
