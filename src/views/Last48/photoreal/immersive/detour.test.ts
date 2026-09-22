// src/views/Last48/photoreal/immersive/detour.test.ts
import { describe, it, expect } from 'vitest'
import { detourFromPlace, detourFromHotspot, sameDetour, arrivalHeadingDeg, HOTSPOT_PITCH_DEG } from './detour'
import { PLACES } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

const HOT: Hotspot = { neighborhood: 'Mission', z: 2, tier: 2, caption: 'well above usual', lng: -122.41, lat: 37.75, count: 3 }

describe('detour builders (Round B §2)', () => {
  it('a Place detour carries its authored camera under a place: key', () => {
    const p = PLACES[0]
    const d = detourFromPlace(p)
    expect(d).toEqual({ key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM })
  })
  it('a Hotspot detour flies to the event centroid at 700 m under a hot: key, with NO authored heading', () => {
    const d = detourFromHotspot(HOT)
    expect(d).toEqual({ key: 'hot:Mission', lng: -122.41, lat: 37.75, headingDeg: null, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M })
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
  it('sameDetour compares a raw difference, not a rounded bucket — two points 1 m apart straddling a 1e-4 boundary still compare equal', () => {
    const d1 = detourFromHotspot({ ...HOT, lng: -122.41004999 })
    const d2 = detourFromHotspot({ ...HOT, lng: -122.41005001 })
    expect(sameDetour(d1, d2)).toBe(true)
  })
  it('sameDetour tells an authored heading from none', () => {
    const hot = detourFromHotspot(HOT)
    expect(sameDetour(hot, { ...hot, headingDeg: 20 })).toBe(false)
  })
})

describe('arrivalHeadingDeg — the heading a leg ARRIVES with (Sept. 21 walk: "look where you\'re flying")', () => {
  const travel = () => 123
  it('an authored heading (a Place) wins, even on the first leg', () => {
    expect(arrivalHeadingDeg(330, { firstLeg: false, houseDeg: 35, travelDeg: travel })).toBe(330)
    expect(arrivalHeadingDeg(330, { firstLeg: true, houseDeg: 35, travelDeg: travel })).toBe(330)
  })
  it('no authored heading (a stop or a Hotspot) arrives facing travel', () => {
    expect(arrivalHeadingDeg(null, { firstLeg: false, houseDeg: 35, travelDeg: travel })).toBe(123)
  })
  it('the first leg of a session keeps the house heading and never reads the travel bearing', () => {
    let read = false
    const spy = () => { read = true; return 123 }
    expect(arrivalHeadingDeg(null, { firstLeg: true, houseDeg: 35, travelDeg: spy })).toBe(35)
    expect(read).toBe(false)
  })
  it('an authored heading of 0 (due north) is a heading, not "none"', () => {
    expect(arrivalHeadingDeg(0, { firstLeg: false, houseDeg: 35, travelDeg: travel })).toBe(0)
  })
  it('every Hotspot arrives facing travel; every Place keeps its own heading', () => {
    expect(detourFromHotspot(HOT).headingDeg).toBeNull()
    for (const p of PLACES) expect(detourFromPlace(p).headingDeg, p.id).toBe(p.headingDeg)
  })
})
