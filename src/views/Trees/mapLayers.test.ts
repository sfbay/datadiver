// src/views/Trees/mapLayers.test.ts
import { describe, expect, it } from 'vitest'
import type mapboxgl from 'mapbox-gl'
import type { NeighborhoodAggregate, TreesSnapshot } from '@/lib/trees/types'
import {
  CHOROPLETH_LAYER_ID, EQUITY_HATCH_LAYER_ID, EQUITY_OUTLINE_LAYER_ID, EQUITY_SOURCE, choroplethFill, equityFeatures, equityLayers,
  DOT_MINZOOM, EMPTY_FC, HEAT_COLOR_STOPS, HEAT_SWATCH_CSS, STUMP_MINZOOM, legendDots, zoomBand, SELECTED_KEYLINE_LAYER, SELECTED_LAYERS, SELECTED_SOURCE, TREE_LAYERS, TREE_POINT_LAYER_IDS,
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

  it('equity draws no stump rings (R23): the stump layer admits no feature of any kind, so none is hovered or clicked', () => {
    for (const pick of PICKS) {
      for (const dark of [true, false]) {
        const f = lensPaint('equity', pick, dark).filters['trees-stumps']
        for (const s of SITES) expect(admits(f, s), `equity/${pick} ${JSON.stringify(s)}`).toBe(false)
      }
    }
    // …and no stump is hit by ANY layer under equity (the dots layer is trees only)
    for (const pick of PICKS) {
      const lp = lensPaint('equity', pick, true)
      for (const s of SITES.filter((x) => x.kind === 1)) {
        expect(TREE_POINT_LAYER_IDS.filter((id) => admits(lp.filters[id], s)), JSON.stringify(s)).toEqual([])
      }
    }
  })

  it('explore keeps its stump rings: every stump is admitted, nothing else', () => {
    for (const pick of PICKS) {
      const f = lensPaint('explore', pick, true).filters['trees-stumps']
      for (const s of SITES) expect(admits(f, s), `explore/${pick} ${JSON.stringify(s)}`).toBe(s.kind === 1)
    }
  })

  it('safety keeps its stump rings: every stump is admitted, nothing else', () => {
    for (const pick of PICKS) {
      const f = lensPaint('safety', pick, true).filters['trees-stumps']
      for (const s of SITES) expect(admits(f, s), `safety/${pick} ${JSON.stringify(s)}`).toBe(s.kind === 1)
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

describe('a stump ring is always larger than a small-trunk dot', () => {
  // Linear interpolation over ['interpolate', ['linear'], ['zoom'], z0, v0, …],
  // clamped at both ends — Mapbox's reading of the expression.
  const at = (expr: unknown[], zoom: number, pick: (v: unknown) => number): number => {
    const pts: [number, number][] = []
    for (let i = 3; i < expr.length; i += 2) pts.push([expr[i] as number, pick(expr[i + 1])])
    if (zoom <= pts[0][0]) return pts[0][1]
    for (let i = 1; i < pts.length; i += 1) {
      const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]
      if (zoom <= z1) return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0)
    }
    return pts[pts.length - 1][1]
  }
  const paint = (id: string) => TREE_LAYERS.find((l) => l.id === id)!.paint as Record<string, unknown[]>
  const dotExpr = paint('trees-dots')['circle-radius']
  const stumpExpr = paint('trees-stumps')['circle-radius']
  const small = (v: unknown) => (v as unknown[])[3] as number // ['match', ['get','cls'], 0, SMALL, …]
  const plain = (v: unknown) => v as number
  const stops = (e: unknown[]) => e.filter((_, i) => i >= 3 && (i - 3) % 2 === 0) as number[]

  it('at every radius stop of either layer (and the safety lens\'s zoom 12)', () => {
    const zooms = [...new Set([12, ...stops(dotExpr), ...stops(stumpExpr)])].sort((a, b) => a - b)
    expect(zooms).toEqual([12, 13, 15, 17])
    for (const z of zooms) {
      expect(at(stumpExpr, z, plain), `zoom ${z}`).toBeGreaterThan(at(dotExpr, z, small))
    }
  })
})

describe('the legend follows what the map draws', () => {
  it('zoom bands: below stumps, stumps only, dots', () => {
    expect([11.9, 12, 12.9, 13, 16].map(zoomBand)).toEqual([0, 1, 1, 2, 2])
    expect(STUMP_MINZOOM).toBe(12)
  })
  it('explore below the dot zoom: no dot rows, "zoom in"; stumps only from their zoom', () => {
    expect(legendDots('explore', 0, false)).toEqual({ classes: [], unmeasured: false, zoomIn: true, stumps: false, species: false })
    expect(legendDots('explore', 1, false)).toEqual({ classes: [], unmeasured: false, zoomIn: true, stumps: true, species: false })
  })
  it('a picked species is drawn at every zoom, so its swatch shows in every band', () => {
    for (const band of [0, 1, 2] as const) expect(legendDots('explore', band, true).species, String(band)).toBe(true)
  })
  it('explore from the dot zoom up: every class, the unmeasured row, stumps', () => {
    expect(legendDots('explore', 2, false)).toEqual({ classes: ['small', 'medium', 'large'], unmeasured: true, zoomIn: false, stumps: true, species: false })
  })
  it('safety draws large trunks and stumps at every zoom, and no species layer', () => {
    for (const band of [0, 1, 2] as const) {
      expect(legendDots('safety', band, true)).toEqual({ classes: ['large'], unmeasured: false, zoomIn: false, stumps: true, species: false })
    }
  })
  it('equity lists no stump row at any zoom band (R23), with or without a species', () => {
    for (const band of [0, 1, 2] as const) {
      for (const picked of [false, true]) expect(legendDots('equity', band, picked).stumps, `${band}/${picked}`).toBe(false)
    }
    // the rest of the equity rows are unchanged
    expect(legendDots('equity', 2, false)).toEqual({ classes: ['small', 'medium', 'large'], unmeasured: true, zoomIn: false, stumps: false, species: false })
  })
  it('the bands match the layers\' own zoom floors outside safety', () => {
    const lp = lensPaint('explore', null, true)
    expect(lp.zoom['trees-stumps'][0]).toBe(STUMP_MINZOOM)
    expect(lp.zoom['trees-dots'][0]).toBe(DOT_MINZOOM)
  })
  it('unmeasured trunks are drawn at the small size at every stop (what the legend row claims)', () => {
    const r = (TREE_LAYERS.find((l) => l.id === 'trees-dots')!.paint as Record<string, unknown[]>)['circle-radius']
    for (let i = 3; i < r.length; i += 2) {
      const m = r[i + 1] as unknown[]
      expect(m[8], `zoom ${String(r[i])}`).toBe(m[3])
    }
  })
  it('the heat swatch and the heat layer read the same stops', () => {
    const heat = TREE_LAYERS.find((l) => l.id === 'trees-heat')!.paint as Record<string, unknown[]>
    expect(heat['heatmap-color'].slice(3)).toEqual(HEAT_COLOR_STOPS.flatMap(([d, c]) => [d, c]))
    for (const [, c] of HEAT_COLOR_STOPS) expect(HEAT_SWATCH_CSS).toContain(c)
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

// ── the equity choropleth ──────────────────────────────────────────────────

describe('equity choropleth', () => {
  const nb = (name: string, perK: number, perKm2: number, flag: NeighborhoodAggregate['flag'] = null): NeighborhoodAggregate =>
    ({ name, trees: 1, stumps: 0, largeTrunks: 0, population: 5000, areaKm2: 1, medianIncome: 1, povertyRate: 1, perK, perKm2, flag, falls: [] })
  const rows = [nb('Tenderloin', 54, 1701), nb('Bayview Hunters Point', 243, 724), nb('Presidio', 23, 14, 'park'), nb('Seacliff', 452, 1983)]
  const square = (n: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[n, 0], [n + 1, 0], [n + 1, 1], [n, 0]]] })
  const boundaries: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: ['Tenderloin', 'Presidio', 'Nowhere'].map((nhood, i) => ({ type: 'Feature', geometry: square(i), properties: { nhood, extra: 1 } })),
  }

  it('features keep the geometry and carry only the join name and the flag', () => {
    const fc = equityFeatures(boundaries, rows)
    expect(fc.features.map((f) => f.properties)).toEqual([
      { nhood: 'Tenderloin', flagged: false },
      { nhood: 'Presidio', flagged: true },
      { nhood: 'Nowhere', flagged: false },
    ])
    expect(fc.features[0].geometry).toBe(boundaries.features[0].geometry)
    expect(equityFeatures(null, rows)).toEqual(EMPTY_FC)
  })

  it('the fill is a match on the neighborhood name, coloured from the stops; flagged and unknown names stay clear', () => {
    const fill = choroplethFill(rows, 'perK', false) as unknown[]
    expect(fill[0]).toBe('match')
    expect(fill[1]).toEqual(['get', 'nhood'])
    const pairs = new Map<string, string>()
    for (let i = 2; i < fill.length - 1; i += 2) pairs.set(fill[i] as string, fill[i + 1] as string)
    expect([...pairs.keys()].sort()).toEqual(['Bayview Hunters Point', 'Seacliff', 'Tenderloin'])
    expect(pairs.get('Seacliff')).toBe('#4f6b33')
    expect(fill[fill.length - 1]).toBe('rgba(0,0,0,0)')
    // re-ranking re-paints
    expect(choroplethFill(rows, 'perKm2', false)).not.toEqual(fill)
    // nothing unflagged: a constant clear fill (an empty match is invalid)
    expect(choroplethFill([nb('Presidio', 23, 14, 'park')], 'perK', false)).toBe('rgba(0,0,0,0)')
    expect(choroplethFill([nb('Presidio', 23, 14, 'park')], 'perK', true)).toBe('rgba(0,0,0,0)')
  })

  it('the fill follows the theme: most trees deep on cream, bright on espresso (R15) — the same stops the legend reads', () => {
    const pairs = (dark: boolean) => {
      const f = choroplethFill(rows, 'perK', dark) as unknown[]
      const m = new Map<string, string>()
      for (let i = 2; i < f.length - 1; i += 2) m.set(f[i] as string, f[i + 1] as string)
      return m
    }
    expect(pairs(false).get('Seacliff')).toBe('#4f6b33')
    expect(pairs(true).get('Seacliff')).toBe('#e6efd6')
    // Tenderloin (fewest) is pale on cream, dim on espresso — never the brightest fill in the dark
    expect(pairs(false).get('Tenderloin')).toBe('#c9dba8')
    expect(pairs(true).get('Tenderloin')).toBe('#7a9954')
    const layerFill = (dark: boolean) =>
      (equityLayers({ rows, by: 'perK', dark, selected: null, hatchImage: 'h' })[0] as mapboxgl.FillLayerSpecification).paint?.['fill-color']
    expect(layerFill(true)).toEqual(choroplethFill(rows, 'perK', true))
    expect(layerFill(false)).toEqual(choroplethFill(rows, 'perK', false))
  })

  it('three layers on their own source: the ramp (unflagged), the hatch (flagged), the selected outline', () => {
    const layers = equityLayers({ rows, by: 'perK', dark: true, selected: null, hatchImage: 'demographic-hatch' })
    expect(layers.map((l) => l.id)).toEqual([CHOROPLETH_LAYER_ID, EQUITY_HATCH_LAYER_ID, EQUITY_OUTLINE_LAYER_ID])
    expect(CHOROPLETH_LAYER_ID).toBe('trees-equity-fill')
    for (const l of layers) expect((l as { source: string }).source).toBe(EQUITY_SOURCE)
    const [fill, hatch] = layers as [mapboxgl.FillLayerSpecification, mapboxgl.FillLayerSpecification]
    expect(fill.filter).toEqual(['!=', ['get', 'flagged'], true])
    expect(hatch.filter).toEqual(['==', ['get', 'flagged'], true])
    expect(hatch.paint?.['fill-pattern']).toBe('demographic-hatch')
  })

  it('theme-aware opacity: 0.5 on espresso, 0.8 on cream', () => {
    const op = (dark: boolean) => (equityLayers({ rows, by: 'perK', dark, selected: null, hatchImage: 'h' })[0] as mapboxgl.FillLayerSpecification).paint?.['fill-opacity']
    expect(op(true)).toBe(0.5)
    expect(op(false)).toBe(0.8)
  })

  it('the outline shows only the selected neighborhood, in the selection ochre', () => {
    const line = (selected: string | null) => equityLayers({ rows, by: 'perK', dark: false, selected, hatchImage: 'h' })[2] as mapboxgl.LineLayerSpecification
    expect(line('Tenderloin').paint?.['line-opacity']).toEqual(['case', ['==', ['get', 'nhood'], 'Tenderloin'], 1, 0])
    expect(line(null).paint?.['line-opacity']).toBe(0)
    expect(line('Tenderloin').paint?.['line-color']).toBe('#d4a435')
  })

  it('the choropleth is never a click or hover target of the tree layers', () => {
    expect(TREE_POINT_LAYER_IDS).not.toContain(CHOROPLETH_LAYER_ID)
  })
})
