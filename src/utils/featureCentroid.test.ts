// src/utils/featureCentroid.test.ts
// Shoelace centroid of a boundary feature — the Dorling cartogram's fallback
// position for a city with no hand-tuned centre table. Hand-computed cases
// first, then the real Oakland region asset.

import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { featureCentroid } from './geo'

function poly(rings: number[][][]): GeoJSON.Feature {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } }
}

describe('featureCentroid', () => {
  it('unit square centres at 0.5 / 0.5', () => {
    const c = featureCentroid(poly([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]))!
    expect(c.lng).toBeCloseTo(0.5, 10)
    expect(c.lat).toBeCloseTo(0.5, 10)
  })

  it('a right triangle centres at the mean of its vertices', () => {
    // (0,0) (3,0) (0,3) → centroid (1, 1)
    const c = featureCentroid(poly([[[0, 0], [3, 0], [0, 3], [0, 0]]]))!
    expect(c.lng).toBeCloseTo(1, 10)
    expect(c.lat).toBeCloseTo(1, 10)
  })

  it('winding direction does not move the centroid', () => {
    const cw = featureCentroid(poly([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]))!
    expect(cw.lng).toBeCloseTo(0.5, 10)
    expect(cw.lat).toBeCloseTo(0.5, 10)
  })

  it('an unclosed ring is still read (the closing vertex is implied)', () => {
    const c = featureCentroid(poly([[[0, 0], [1, 0], [1, 1], [0, 1]]]))!
    expect(c.lng).toBeCloseTo(0.5, 10)
    expect(c.lat).toBeCloseTo(0.5, 10)
  })

  it('a MultiPolygon takes its LARGEST part, not its first', () => {
    const f: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          // a 1×1 speck first…
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          // …and the 4×4 mainland second
          [[[10, 10], [14, 10], [14, 14], [10, 14], [10, 10]]],
        ],
      },
    }
    const c = featureCentroid(f)!
    expect(c.lng).toBeCloseTo(12, 10)
    expect(c.lat).toBeCloseTo(12, 10)
  })

  it('holes do not shift the centroid — only the outer ring is read', () => {
    const c = featureCentroid(
      poly([
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
      ]),
    )!
    expect(c.lng).toBeCloseTo(2, 10)
    expect(c.lat).toBeCloseTo(2, 10)
  })

  it('returns null for geometry it cannot read', () => {
    expect(featureCentroid({ type: 'Feature', properties: {}, geometry: null as never })).toBeNull()
    expect(
      featureCentroid({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [1, 2] },
      }),
    ).toBeNull()
    // degenerate: a two-point "ring" encloses no area
    expect(featureCentroid(poly([[[0, 0], [1, 1]]]))).toBeNull()
    // degenerate: collinear points, zero signed area
    expect(featureCentroid(poly([[[0, 0], [1, 1], [2, 2], [0, 0]]]))).toBeNull()
  })
})

describe('the committed Oakland region asset', () => {
  const fc = JSON.parse(
    readFileSync('public/data/geo/oakland-regions.geojson', 'utf8'),
  ) as GeoJSON.FeatureCollection

  it('every Oakland region yields a centroid inside the Oakland bbox', () => {
    expect(fc.features.length).toBe(10)
    for (const f of fc.features) {
      const c = featureCentroid(f)
      expect(c).not.toBeNull()
      expect(c!.lat).toBeGreaterThan(37.6)
      expect(c!.lat).toBeLessThan(37.9)
      expect(c!.lng).toBeGreaterThan(-122.4)
      expect(c!.lng).toBeLessThan(-122.1)
    }
  })

  it('no two regions land on the same point', () => {
    const seen = new Set(
      fc.features.map((f) => {
        const c = featureCentroid(f)!
        return `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`
      }),
    )
    expect(seen.size).toBe(10)
  })
})
