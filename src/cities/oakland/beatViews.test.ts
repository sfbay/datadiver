/**
 * Pins for the hand-tuned beat camera presets. Deliberately NOT the
 * bijective byte-pin beatNames.ts gets: that table is a complete editorial
 * vocabulary; this one grows a beat at a time as frames get dialed in via
 * ?debug=map (absent beats fall back to polygon fitBounds). The contract
 * here is structural — a typo'd beat code, an SF coordinate pasted from the
 * wrong tab, or a nonsense camera value fails; adding a real tuning is a
 * one-row edit in beatViews.ts and nothing else.
 */
import { describe, it, expect } from 'vitest'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_BEAT_VIEWS } from './beatViews'

describe('OAKLAND_BEAT_VIEWS', () => {
  const entries = Object.entries(OAKLAND_BEAT_VIEWS)
  const beatSet = new Set<string>(OAKLAND_BEATS)

  it('keys are canonical beat codes (subset of OAKLAND_BEATS — partial by design)', () => {
    for (const [code] of entries) {
      expect(beatSet.has(code), `'${code}' is not a canonical beat code`).toBe(true)
    }
  })

  it('every preset frames a plausible Oakland camera', () => {
    for (const [code, view] of entries) {
      // Oakland-only bbox — tight enough to exclude ALL of SF, including
      // Treasure Island (lng -122.3698), the closest SF land to Oakland.
      expect(view.center.lat, `${code} lat`).toBeGreaterThan(37.69)
      expect(view.center.lat, `${code} lat`).toBeLessThan(37.9)
      expect(view.center.lng, `${code} lng`).toBeGreaterThan(-122.35)
      expect(view.center.lng, `${code} lng`).toBeLessThan(-122.09)
      // Beat-scale framing: citywide is ~11.6, block-level ~17.
      expect(view.zoom, `${code} zoom`).toBeGreaterThanOrEqual(12)
      expect(view.zoom, `${code} zoom`).toBeLessThanOrEqual(18)
      expect(view.pitch, `${code} pitch`).toBeGreaterThanOrEqual(0)
      expect(view.pitch, `${code} pitch`).toBeLessThanOrEqual(85) // Mapbox max
      expect(Math.abs(view.bearing), `${code} bearing`).toBeLessThanOrEqual(360)
    }
  })
})
