// src/views/Trees/mapLayers.test.ts
import { describe, expect, it } from 'vitest'
import type { TreesSnapshot } from '@/lib/trees/types'
import { DOT_MINZOOM, TREE_LAYERS, TREE_POINT_LAYER_IDS, siteFeatures } from './mapLayers'

const snap: TreesSnapshot = {
  asOf: '2026-09-30', dataAsOf: '2026-09-30', species: ['A :: a', 'Stump :: Stump'], neighborhoods: ['Mission'],
  id: [1, 2, 3], x: [58094, -1, 58100], y: [78896, -1, 78900],
  sp: [0, 0, 1], kind: [0, 0, 1], cls: [2, 0, 3], yr: [1999, 0, 0], nb: [0, -1, 0], nt: [1, 0, 0], fl: [2, 0, 0],
}

describe('siteFeatures', () => {
  const fc = siteFeatures(snap)
  it('skips sites with no coordinates', () => {
    expect(fc.features.map((f) => f.properties!.id)).toEqual([1, 3])
  })
  it('decodes coordinates to five decimals', () => {
    const [lon, lat] = (fc.features[0].geometry as GeoJSON.Point).coordinates
    expect(lon).toBeCloseTo(-122.41906, 5)
    expect(lat).toBeCloseTo(37.78896, 5)
  })
  it('carries exactly the properties the layers filter on', () => {
    expect(fc.features[0].properties).toEqual({ id: 1, sp: 0, kind: 0, cls: 2, nt: 1, fl: 2 })
  })
})

describe('layer specs', () => {
  it('dots appear from the measured zoom; stumps are their own layer', () => {
    const dots = TREE_LAYERS.find((l) => l.id === 'trees-dots')!
    expect(dots.minzoom).toBe(DOT_MINZOOM)
    expect(TREE_LAYERS.some((l) => l.id === 'trees-stumps')).toBe(true)
  })
  it('click targets are the point layers only', () => {
    expect(TREE_POINT_LAYER_IDS).toEqual(['trees-dots', 'trees-stumps', 'trees-species'])
  })
})
