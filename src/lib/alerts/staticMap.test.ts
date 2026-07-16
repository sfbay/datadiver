import { describe, it, expect } from 'vitest'
import { haversineMiles } from './match'
import { encodePolyline, circleRing, circlePolyline, buildStaticMapUrl, zoomForRadius } from './staticMap'

describe('encodePolyline', () => {
  it('matches the Google reference vector', () => {
    // Canonical example from Google's polyline algorithm docs.
    const encoded = encodePolyline([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
    expect(encoded).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  })
})

describe('circleRing', () => {
  const CENTER = { lat: 37.7599, lng: -122.4148 } // Mission-ish
  it('returns points+1 vertices and closes the loop', () => {
    const ring = circleRing(CENTER.lat, CENTER.lng, 0.5, 32)
    expect(ring).toHaveLength(33)
    expect(ring[0][0]).toBeCloseTo(ring[32][0], 6)
    expect(ring[0][1]).toBeCloseTo(ring[32][1], 6)
  })
  it('places every vertex ~radius miles from the center', () => {
    const ring = circleRing(CENTER.lat, CENTER.lng, 0.5, 16)
    for (const [lat, lng] of ring) {
      const d = haversineMiles(CENTER, { lat, lng })
      expect(d).toBeGreaterThan(0.45)
      expect(d).toBeLessThan(0.55)
    }
  })
})

describe('buildStaticMapUrl', () => {
  const base = {
    center: { lat: 37.7599, lng: -122.4148 },
    radiusMiles: 0.5,
    dots: [
      { lat: 37.761, lng: -122.414 },
      { lat: 37.758, lng: -122.417 },
    ],
    token: 'pk.test',
  }
  it('returns null with no token', () => {
    expect(buildStaticMapUrl({ ...base, token: '' })).toBeNull()
  })
  it('builds an explicit-positioned @2x url with ring, home pin, and capped dots', () => {
    const url = buildStaticMapUrl(base)!
    expect(url).toContain('/styles/v1/mapbox/light-v11/static/')
    expect(url).not.toContain('/auto/')
    expect(url).toContain('access_token=pk.test')
    expect(url).toContain('path-2+963e30')          // ring
    expect(url).toContain('pin-l+1e140d')           // home
    expect((url.match(/pin-s\+963e30/g) ?? []).length).toBe(2) // 2 dots
  })
  it('caps dots at maxDots', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ lat: 37.76 + i * 1e-4, lng: -122.41 }))
    const url = buildStaticMapUrl({ ...base, dots: many })!
    expect((url.match(/pin-s\+963e30/g) ?? []).length).toBe(20)
  })
  it('returns null when the url would exceed the length budget', () => {
    const hugeToken = 'p'.repeat(8000)
    expect(buildStaticMapUrl({ ...base, token: hugeToken })).toBeNull()
  })
})

describe('zoomForRadius', () => {
  it('pins city-scale zooms for the radius vocabulary at SF latitude', () => {
    expect(zoomForRadius(0.5, 37.76)).toBeCloseTo(12.53, 1)
    expect(zoomForRadius(0.125, 37.76)).toBeCloseTo(14.53, 1)
  })
  it('clamps extreme radii into the sane band', () => {
    expect(zoomForRadius(20, 37.76)).toBe(11.5)
    expect(zoomForRadius(0.001, 37.76)).toBe(15.5)
  })
})

describe('buildStaticMapUrl pitch positioning', () => {
  it('positions explicitly with pitch 30 (no auto)', () => {
    const url = buildStaticMapUrl({ center: { lat: 37.76, lng: -122.42 }, radiusMiles: 0.5, dots: [], token: 'tok' })!
    expect(url).not.toContain('/auto/')
    expect(url).toMatch(/,-?\d+(\.\d+)?,0,30\/560x280@2x/)
  })
})
