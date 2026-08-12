import { describe, it, expect } from 'vitest'
import { computeStops } from './DemographicUnderlay'

describe('computeStops', () => {
  it('returns null when no feature carries a value (never emits a flat interpolate)', () => {
    expect(computeStops([])).toBeNull()
  })
  it('returns strictly ascending stops for real values', () => {
    const stops = computeStops([1, 2, 3, 4, 5, 6, 7, 8])!
    expect(stops).not.toBeNull()
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1])
  })
  it('returns null when every value is identical (a flat ramp is not a ramp)', () => {
    expect(computeStops([5, 5, 5, 5])).toBeNull()
  })
})
