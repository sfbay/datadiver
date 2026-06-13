import { describe, it, expect } from 'vitest'
import { buildFlightPath, mercatorPx, mercatorPxToLngLat } from './flightPath'

describe('mercator round trip', () => {
  it('inverts within float tolerance at SF coordinates', () => {
    const { x, y } = mercatorPx(-122.4376, 37.7577)
    const back = mercatorPxToLngLat(x, y)
    expect(back.lng).toBeCloseTo(-122.4376, 6)
    expect(back.lat).toBeCloseTo(37.7577, 6)
  })
})

describe('buildFlightPath', () => {
  const sf = { ...mercatorPx(-122.4376, 37.7577), zoom: 11.5 }
  const soma = { ...mercatorPx(-122.405, 37.778), zoom: 14 }

  it('hits both endpoints exactly', () => {
    const path = buildFlightPath(sf, soma, 1280)
    const p0 = path(0)
    const p1 = path(1)
    expect(p0.x).toBeCloseTo(sf.x, 6)
    expect(p0.y).toBeCloseTo(sf.y, 6)
    expect(p0.zoom).toBeCloseTo(sf.zoom, 6)
    expect(p1.x).toBeCloseTo(soma.x, 6)
    expect(p1.y).toBeCloseTo(soma.y, 6)
    expect(p1.zoom).toBeCloseTo(soma.zoom, 6)
  })

  it('dips below the higher endpoint zoom mid-flight (the van Wijk arc)', () => {
    const path = buildFlightPath(sf, soma, 1280)
    const mid = path(0.5)
    // The arc keeps mid-flight zoom at or below the destination zoom —
    // it must never overshoot above it for a zoom-in flight.
    expect(mid.zoom).toBeLessThan(soma.zoom)
  })

  it('position progresses monotonically along the chord', () => {
    const path = buildFlightPath(sf, soma, 1280)
    let prev = 0
    for (let i = 0; i <= 10; i++) {
      const p = path(i / 10)
      const frac = (p.x - sf.x) / (soma.x - sf.x)
      expect(frac).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = frac
    }
    expect(prev).toBeCloseTo(1, 6)
  })

  it('handles pure zoom (no pan) without NaN', () => {
    const a = { x: 100, y: 100, zoom: 11 }
    const b = { x: 100, y: 100, zoom: 14 }
    const path = buildFlightPath(a, b, 1280)
    const mid = path(0.5)
    expect(Number.isFinite(mid.zoom)).toBe(true)
    expect(mid.x).toBe(100)
    expect(path(1).zoom).toBeCloseTo(14, 6)
  })

  it('handles identical endpoints without NaN', () => {
    const a = { x: 100, y: 100, zoom: 12 }
    const path = buildFlightPath(a, { ...a }, 1280)
    const mid = path(0.5)
    expect(Number.isFinite(mid.x)).toBe(true)
    expect(Number.isFinite(mid.zoom)).toBe(true)
  })

  it('never produces NaN across the whole parameter range', () => {
    const path = buildFlightPath(sf, soma, 1280)
    for (let i = 0; i <= 100; i++) {
      const p = path(i / 100)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.zoom)).toBe(true)
    }
  })
})
