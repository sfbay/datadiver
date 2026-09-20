// src/views/Last48/photoreal/immersive/places.test.ts
import { describe, it, expect } from 'vitest'
import { PLACES, PLACES_SHOWN, PLACE_CAPTION_MAX } from './places'
import { SF_BOUNDS } from '@/utils/geo'

describe('PLACES (Round B §2)', () => {
  it('seeds eight places and shows four', () => {
    expect(PLACES).toHaveLength(8)
    expect(PLACES_SHOWN).toBe(4)
  })
  it('ids are unique kebab-case', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
  it('every place sits inside San Francisco', () => {
    for (const p of PLACES) {
      expect(p.lat, p.id).toBeGreaterThan(SF_BOUNDS.south)
      expect(p.lat, p.id).toBeLessThan(SF_BOUNDS.north)
      expect(p.lng, p.id).toBeGreaterThan(SF_BOUNDS.west)
      expect(p.lng, p.id).toBeLessThan(SF_BOUNDS.east)
    }
  })
  it('camera range is 150–1500 m, pitch looks down, heading is a compass bearing', () => {
    for (const p of PLACES) {
      expect(p.rangeM, p.id).toBeGreaterThanOrEqual(150)
      expect(p.rangeM, p.id).toBeLessThanOrEqual(1500)
      expect(p.pitchDeg, p.id).toBeLessThan(0)
      expect(p.pitchDeg, p.id).toBeGreaterThanOrEqual(-60)
      expect(p.headingDeg, p.id).toBeGreaterThanOrEqual(0)
      expect(p.headingDeg, p.id).toBeLessThan(360)
    }
  })
  it('captions are short and plain', () => {
    for (const p of PLACES) {
      expect(p.caption.length, p.id).toBeLessThanOrEqual(PLACE_CAPTION_MAX)
      expect(p.caption, p.id).not.toMatch(/live/i)
    }
  })
})
