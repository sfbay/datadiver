// src/views/Last48/modes/anomalyRamp.test.ts
//
// Unit tests for the anomaly choropleth's pure layer: the Stouffer combine
// and the ramp-preset invariants that keep the map and its legend honest.

import { describe, it, expect } from 'vitest'
import {
  combineZ,
  RAMP_PRESETS,
  DEFAULT_RAMP_ID,
  getRampPreset,
  rampFillColor,
  rampCssGradient,
  rampTypicalPercent,
} from './anomalyRamp'

/** Parse the alpha channel out of an rgba() string. */
const alphaOf = (rgba: string): number => {
  const m = rgba.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/)
  if (!m) throw new Error(`not an rgba() string: ${rgba}`)
  return Number(m[1])
}

/** Parse the rgb channels (hue identity) out of an rgba() string. */
const hueOf = (rgba: string): string => {
  const m = rgba.match(/rgba\(\s*(\d+\s*,\s*\d+\s*,\s*\d+)/)
  if (!m) throw new Error(`not an rgba() string: ${rgba}`)
  return m[1].replace(/\s/g, '')
}

describe('combineZ (Stouffer)', () => {
  it('returns 0 for no streams', () => {
    expect(combineZ([])).toBe(0)
  })

  it('is the identity for a single stream', () => {
    expect(combineZ([1.7])).toBeCloseTo(1.7)
    expect(combineZ([-2.1])).toBeCloseTo(-2.1)
  })

  it('spreads wider than the arithmetic mean for k=3 (the flat-map fix)', () => {
    const zs = [1.2, 1.5, 0.9]
    const mean = (1.2 + 1.5 + 0.9) / 3
    const combined = combineZ(zs)
    expect(combined).toBeCloseTo((1.2 + 1.5 + 0.9) / Math.sqrt(3))
    // Stouffer = mean × √k — for k=3, ~1.73× the mean.
    expect(combined / mean).toBeCloseTo(Math.sqrt(3))
  })

  it('lets opposing streams cancel (a spike + a lull ≈ typical)', () => {
    expect(combineZ([2, -2])).toBeCloseTo(0)
  })
})

describe('RAMP_PRESETS invariants', () => {
  it('the default preset exists', () => {
    expect(RAMP_PRESETS.some((p) => p.id === DEFAULT_RAMP_ID)).toBe(true)
  })

  it('getRampPreset falls back to the default on unknown/absent ids', () => {
    expect(getRampPreset('nope').id).toBe(DEFAULT_RAMP_ID)
    expect(getRampPreset(null).id).toBe(DEFAULT_RAMP_ID)
    expect(getRampPreset(undefined).id).toBe(DEFAULT_RAMP_ID)
    expect(getRampPreset('warm-only').id).toBe('warm-only')
  })

  for (const preset of RAMP_PRESETS) {
    describe(`preset "${preset.id}"`, () => {
      it('has strictly increasing z stops (interpolate requires it)', () => {
        for (let i = 1; i < preset.stops.length; i++) {
          expect(preset.stops[i].z).toBeGreaterThan(preset.stops[i - 1].z)
        }
      })

      it('every stop is an rgba() string (alpha-carrying, hex would hide fades)', () => {
        for (const s of preset.stops) expect(() => alphaOf(s.color)).not.toThrow()
      })

      it('fades to transparent stay on the SAME hue (alpha-only fades, never toward a dark color)', () => {
        // For each zero-alpha stop, at least one adjacent stop must share its
        // hue — the fade is an alpha ramp of one pigment, not a hue shift
        // through transparency.
        preset.stops.forEach((s, i) => {
          if (alphaOf(s.color) !== 0) return
          const neighbors = [preset.stops[i - 1], preset.stops[i + 1]].filter(Boolean)
          expect(neighbors.some((n) => hueOf(n.color) === hueOf(s.color))).toBe(true)
        })
      })

      it('hero-fill opacity: above the demographic underlay (0.22), below the old flat 0.55', () => {
        expect(preset.fillOpacity).toBeGreaterThan(0.22)
        expect(preset.fillOpacity).toBeLessThan(0.55)
      })

      it('quietSide matches whether the stops actually reach below typical', () => {
        expect(preset.stops[0].z < 0).toBe(preset.quietSide)
      })
    })
  }
})

describe('expression + legend derivation (one stops array, two outputs)', () => {
  it('rampFillColor emits a linear interpolate on zScore with every stop, in order', () => {
    const p = getRampPreset('diverging')
    const expr = rampFillColor(p)
    expect(expr.slice(0, 3)).toEqual(['interpolate', ['linear'], ['get', 'zScore']])
    const rest = expr.slice(3)
    expect(rest.length).toBe(p.stops.length * 2)
    p.stops.forEach((s, i) => {
      expect(rest[i * 2]).toBe(s.z)
      expect(rest[i * 2 + 1]).toBe(s.color)
    })
  })

  it('rampCssGradient spans 0% to 100% over the same stops', () => {
    const p = getRampPreset('diverging')
    const css = rampCssGradient(p)
    expect(css.startsWith('linear-gradient(to right, ')).toBe(true)
    expect(css).toContain(`${p.stops[0].color} 0.0%`)
    expect(css).toContain(`${p.stops[p.stops.length - 1].color} 100.0%`)
    // stop count preserved
    expect(css.split('rgba').length - 1).toBe(p.stops.length)
  })

  it('rampTypicalPercent marks z=0 inside a diverging domain, null for warm-only', () => {
    const div = rampTypicalPercent(getRampPreset('diverging'))
    expect(div).not.toBeNull()
    expect(div!).toBeGreaterThan(0)
    expect(div!).toBeLessThan(100)
    expect(rampTypicalPercent(getRampPreset('warm-only'))).toBeNull()
  })
})
