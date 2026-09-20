// src/views/Last48/photoreal/immersive/detour.test.ts
import { describe, it, expect } from 'vitest'
import { detourFromPlace, detourFromHotspot, sameDetour, HOTSPOT_HEADING_DEG, HOTSPOT_PITCH_DEG } from './detour'
import { PLACES } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

const HOT: Hotspot = { neighborhood: 'Mission', z: 2, tier: 2, caption: 'well above usual', lng: -122.41, lat: 37.75, count: 3 }

describe('detour builders (Round B §2)', () => {
  it('a Place detour carries its authored camera under a place: key', () => {
    const p = PLACES[0]
    const d = detourFromPlace(p)
    expect(d).toEqual({ key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM })
  })
  it('a Hotspot detour flies to the event centroid at 700 m under a hot: key', () => {
    const d = detourFromHotspot(HOT)
    expect(d).toEqual({ key: 'hot:Mission', lng: -122.41, lat: 37.75, headingDeg: HOTSPOT_HEADING_DEG, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M })
  })
  it('sameDetour ignores centroid drift under ~11 m so a poll does not re-fly', () => {
    const a = detourFromHotspot(HOT)
    const b = detourFromHotspot({ ...HOT, lng: -122.41004, lat: 37.75004 })
    const c = detourFromHotspot({ ...HOT, lng: -122.42 })
    expect(sameDetour(a, b)).toBe(true)
    expect(sameDetour(a, c)).toBe(false)
    expect(sameDetour(a, null)).toBe(false)
    expect(sameDetour(null, null)).toBe(true)
  })
})
