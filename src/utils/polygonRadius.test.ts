import { describe, it, expect } from 'vitest'
import { neighborhoodsWithinRadius, type BoundaryCollection } from './polygonRadius'
import { haversineMiles } from '@/lib/alerts/match'

// A ~1.4mi × 1.1mi square around SF's Mission core. 0.01° lat ≈ 0.69 mi;
// 0.01° lng ≈ 0.55 mi at 37.76°N.
const SQUARE: number[][] = [
  [-122.43, 37.75],
  [-122.41, 37.75],
  [-122.41, 37.77],
  [-122.43, 37.77],
  [-122.43, 37.75],
]

const boundaries: BoundaryCollection = {
  features: [
    { properties: { nhood: 'Mission' }, geometry: { type: 'Polygon', coordinates: [SQUARE] } },
    {
      properties: { nhood: 'Islands' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[-122.37, 37.81], [-122.36, 37.81], [-122.36, 37.82], [-122.37, 37.82], [-122.37, 37.81]]]],
      },
    },
    { properties: {}, geometry: { type: 'Polygon', coordinates: [SQUARE] } }, // nameless — skipped
  ],
}

describe('neighborhoodsWithinRadius', () => {
  it('includes the polygon containing the pin', () => {
    expect(neighborhoodsWithinRadius(-122.42, 37.76, 0.125, boundaries)).toEqual(['Mission'])
  })
  it('includes a polygon whose edge is within the radius of an outside pin', () => {
    // Pin 0.005° east of the square's east edge ≈ 0.276 mi away.
    const out = neighborhoodsWithinRadius(-122.405, 37.76, 0.5, boundaries)
    expect(out).toContain('Mission')
  })
  it('excludes a polygon beyond the radius', () => {
    expect(neighborhoodsWithinRadius(-122.405, 37.76, 0.125, boundaries)).toEqual([])
  })
  it('handles MultiPolygon geometry', () => {
    expect(neighborhoodsWithinRadius(-122.365, 37.815, 0.125, boundaries)).toEqual(['Islands'])
  })
  it('projection distance agrees with haversine within 1% at SF scale', () => {
    // Distance from the outside pin to the square's nearest edge point,
    // which is due west of the pin at (-122.41, 37.76).
    const expected = haversineMiles({ lat: 37.76, lng: -122.405 }, { lat: 37.76, lng: -122.41 })
    // The pin sits inside at radius just over `expected`, outside just under.
    expect(neighborhoodsWithinRadius(-122.405, 37.76, expected * 1.01, boundaries)).toContain('Mission')
    expect(neighborhoodsWithinRadius(-122.405, 37.76, expected * 0.99, boundaries)).not.toContain('Mission')
  })
  it('clamps to segment endpoints: nearest boundary point can be a VERTEX', () => {
    // Pin diagonally off the square's NE corner (-122.41, 37.77). The
    // perpendicular foot onto BOTH adjacent edge LINES lies outside their
    // segments, so the true nearest boundary point is the corner itself
    // (~0.88 mi). An unclamped infinite-line projection would report the
    // north edge's line at only ~0.69 mi and wrongly include the polygon.
    const pin = { lat: 37.78, lng: -122.4 }
    const corner = { lat: 37.77, lng: -122.41 }
    const expected = haversineMiles(pin, corner)
    expect(neighborhoodsWithinRadius(pin.lng, pin.lat, expected * 1.01, boundaries)).toContain('Mission')
    expect(neighborhoodsWithinRadius(pin.lng, pin.lat, expected * 0.99, boundaries)).not.toContain('Mission')
  })
})
