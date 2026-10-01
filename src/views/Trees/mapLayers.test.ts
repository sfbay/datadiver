// src/views/Trees/mapLayers.test.ts
import { describe, expect, it } from 'vitest'
import type { TreesSnapshot } from '@/lib/trees/types'
import {
  DOT_MINZOOM, EMPTY_FC, SELECTED_KEYLINE_LAYER, SELECTED_LAYERS, SELECTED_SOURCE, TREE_LAYERS, TREE_POINT_LAYER_IDS,
  lensPaint, selectedFeature, selectedKeyline, siteFeatures, siteLngLat,
} from './mapLayers'
import type { Lens } from './treesUrl'

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

// ── lensPaint ─────────────────────────────────────────────────────────────
// A tiny evaluator for the filter grammar the layers use (all / == / != /
// get), so the tests check what each filter ADMITS, not how it is spelled.

type Props = { kind: number; sp: number; cls: number }
function admits(filter: unknown, p: Props): boolean {
  const f = filter as unknown[]
  const val = (x: unknown): unknown =>
    Array.isArray(x) && x[0] === 'get' ? p[x[1] as keyof Props] : x
  switch (f[0]) {
    case 'all': return f.slice(1).every((g) => admits(g, p))
    case '==': return val(f[1]) === val(f[2])
    case '!=': return val(f[1]) !== val(f[2])
    default: throw new Error(`unexpected filter op ${String(f[0])}`)
  }
}

/** Every site shape the source can hold: all four kinds × a few species × every trunk class. */
const SITES: Props[] = []
for (const kind of [0, 1, 2, 3]) for (const sp of [-1, 0, 7, 12]) for (const cls of [0, 1, 2, 3]) SITES.push({ kind, sp, cls })

const LENSES: Lens[] = ['explore', 'equity', 'safety']
const PICKS: (number | null)[] = [null, 7]
const CASES = LENSES.flatMap((lens) => PICKS.flatMap((pick) => [true, false].map((dark) => ({ lens, pick, dark }))))

describe('lensPaint', () => {
  it('names every layer in filters and zoom, under every lens', () => {
    const ids = TREE_LAYERS.map((l) => l.id).sort()
    for (const { lens, pick, dark } of CASES) {
      const lp = lensPaint(lens, pick, dark)
      expect(Object.keys(lp.filters).sort()).toEqual(ids)
      expect(Object.keys(lp.zoom).sort()).toEqual(ids)
    }
  })

  it('never admits an empty planting site or a shrub — in any lens, with or without a species', () => {
    for (const { lens, pick, dark } of CASES) {
      const lp = lensPaint(lens, pick, dark)
      for (const [layer, f] of Object.entries(lp.filters)) {
        for (const site of SITES.filter((s) => s.kind >= 2)) {
          expect(admits(f, site), `${lens}/${pick}/${layer} admits kind ${site.kind}`).toBe(false)
        }
      }
    }
    // The static specs (what a fresh style shows before the first apply) too.
    for (const l of TREE_LAYERS) {
      for (const site of SITES.filter((s) => s.kind >= 2)) expect(admits(l.filter, site), l.id).toBe(false)
    }
  })

  it('the point layers partition: each tree or stump is drawn (and hit) by at most one layer', () => {
    for (const { lens, pick, dark } of CASES) {
      const lp = lensPaint(lens, pick, dark)
      for (const site of SITES.filter((s) => s.kind <= 1)) {
        const hits = TREE_POINT_LAYER_IDS.filter((id) => admits(lp.filters[id], site))
        expect(hits.length, `${lens}/${pick} ${JSON.stringify(site)} → ${hits.join(',')}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('explore with a species: that species leaves the dots and lights at every zoom; others dim to 0.25', () => {
    const lp = lensPaint('explore', 7, true)
    expect(admits(lp.filters['trees-species'], { kind: 0, sp: 7, cls: 0 })).toBe(true)
    expect(admits(lp.filters['trees-species'], { kind: 0, sp: 12, cls: 0 })).toBe(false)
    expect(admits(lp.filters['trees-dots'], { kind: 0, sp: 7, cls: 0 })).toBe(false)
    expect(admits(lp.filters['trees-dots'], { kind: 0, sp: 12, cls: 0 })).toBe(true)
    expect(lp.zoom['trees-species']).toEqual([0, 24])
    expect(lp.paint['trees-dots']['circle-opacity']).toBe(0.25)
  })

  it('the species layer lights ONLY under explore with a species selected', () => {
    for (const { lens, pick, dark } of CASES) {
      const lit = SITES.some((s) => admits(lensPaint(lens, pick, dark).filters['trees-species'], s))
      expect(lit, `${lens}/${pick}`).toBe(lens === 'explore' && pick !== null)
    }
  })

  it('explore without a species: every tree is a dot at full strength', () => {
    const lp = lensPaint('explore', null, false)
    for (const s of SITES.filter((x) => x.kind === 0)) expect(admits(lp.filters['trees-dots'], s)).toBe(true)
    expect(lp.paint['trees-dots']['circle-opacity']).toBe(0.75)
    expect(lp.paint['trees-heat']['heatmap-opacity']).toBe(0.8)
  })

  it('equity dims the dots and the heat', () => {
    for (const pick of PICKS) {
      const lp = lensPaint('equity', pick, true)
      expect(lp.paint['trees-dots']['circle-opacity']).toBe(0.35)
      expect(lp.paint['trees-heat']['heatmap-opacity']).toBe(0.35)
    }
  })

  it('safety: large-trunk trees only, at every zoom; stumps at every zoom; heat hidden; no species', () => {
    for (const pick of PICKS) {
      const lp = lensPaint('safety', pick, true)
      for (const s of SITES.filter((x) => x.kind === 0)) {
        expect(admits(lp.filters['trees-dots'], s), JSON.stringify(s)).toBe(s.cls === 2)
      }
      expect(lp.zoom['trees-dots']).toEqual([0, 24])
      expect(admits(lp.filters['trees-stumps'], { kind: 1, sp: -1, cls: 3 })).toBe(true)
      expect(lp.zoom['trees-stumps']).toEqual([0, 24])
      expect(lp.paint['trees-heat']['heatmap-opacity']).toBe(0)
      expect(SITES.some((s) => admits(lp.filters['trees-species'], s))).toBe(false)
    }
  })

  it('outside safety, dots keep their zoom floor and stumps start at 12', () => {
    for (const lens of ['explore', 'equity'] as const) {
      const lp = lensPaint(lens, null, true)
      expect(lp.zoom['trees-dots']).toEqual([DOT_MINZOOM, 24])
      expect(lp.zoom['trees-stumps']).toEqual([12, 24])
    }
  })

  it('the species keyline follows the theme (paper on espresso, espresso on cream)', () => {
    expect(lensPaint('explore', 7, true).paint['trees-species']['circle-stroke-color']).toBe('#f5ecd9')
    expect(lensPaint('explore', 7, false).paint['trees-species']['circle-stroke-color']).toBe('#1e140d')
  })
})

describe('dot radii scale with zoom and keep the trunk-class ratios', () => {
  it('stops at 13 / 15 / 17 match the browser-walk ruling (R11)', () => {
    const dots = TREE_LAYERS.find((l) => l.id === 'trees-dots')!
    const r = (dots.paint as Record<string, unknown>)['circle-radius'] as unknown[]
    expect(r.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']])
    const stops = new Map<number, number[]>()
    for (let i = 3; i < r.length; i += 2) {
      const m = r[i + 1] as unknown[] // ['match', ['get','cls'], 0, s, 1, m, 2, l, u]
      stops.set(r[i] as number, [m[3], m[5], m[7], m[8]] as number[])
    }
    expect(stops.get(13)).toEqual([1.2, 1.7, 2.4, 1.2])
    expect(stops.get(15)).toEqual([2.5, 3.5, 5, 2.5])
    expect(stops.get(17)).toEqual([4, 5.5, 8, 4])
  })
})

describe('the selected-site ring', () => {
  it('decodes a site point the way siteFeatures does, and none without one', () => {
    const [lon, lat] = siteLngLat(58094, 78896)!
    expect(lon).toBeCloseTo(-122.41906, 5)
    expect(lat).toBeCloseTo(37.78896, 5)
    expect(siteLngLat(-1, -1)).toBeNull()
  })
  it('one feature for a point, none without one', () => {
    expect(selectedFeature([-122.4, 37.7]).features).toHaveLength(1)
    expect(selectedFeature(null)).toEqual(EMPTY_FC)
  })
  it('a keyline under a moss ring, both on their own source, never a click target', () => {
    expect(SELECTED_LAYERS.map((l) => l.id)).toEqual([SELECTED_KEYLINE_LAYER, 'trees-selected'])
    for (const l of SELECTED_LAYERS) {
      expect(l.source).toBe(SELECTED_SOURCE)
      expect(TREE_POINT_LAYER_IDS).not.toContain(l.id)
    }
  })
  it('the keyline follows the theme', () => {
    expect(selectedKeyline(true)).toBe('#f5ecd9')
    expect(selectedKeyline(false)).toBe('#1e140d')
  })
})
