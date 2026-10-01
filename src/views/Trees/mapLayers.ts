// src/views/Trees/mapLayers.ts
//
// The Trees map: ONE GeoJSON source (every mapped inventory site) and four
// layers on it, each narrowed by a FILTER EXPRESSION — so a lens change, or a
// species pick, re-filters and re-paints in place and never rebuilds the
// ~139k features. Pure and node-testable: type-only mapbox import.
//
//   trees-heat     heatmap of street trees (kind 0) below DOT_MINZOOM — the
//                  city-scale texture; moss ramp, bright end for espresso.
//   trees-dots     street trees from DOT_MINZOOM, radius by trunk class as
//                  recorded (small · medium · large · not measured).
//   trees-stumps   hollow brick rings (the hollow-ring idiom) from zoom 12.
//   trees-species  the selected species at EVERY zoom, keylined, drawn last.
//
// Empty planting sites (kind 2) and shrubs (kind 3) are in the source — a
// `?tree=` deep link can still name one — but no layer ever draws them.

import type mapboxgl from 'mapbox-gl'
import type { TreesSnapshot } from '@/lib/trees/types'
import type { Lens } from './treesUrl'

export const TREES_SOURCE = 'trees-sites'

/** Street-tree dots appear from this zoom; the heatmap covers below it.
 *  Measured gate (plan Task 7 Step 7): raise to 14 if panning drops frames. */
export const DOT_MINZOOM = 13
const STUMP_MINZOOM = 12

// ── pigments ───────────────────────────────────────────────────────────────

export const MOSS_500 = '#7a9954'
export const MOSS_400 = '#9bb37c'
export const BRICK_600 = '#963e30'
const KEYLINE_DARK = '#f5ecd9' // paper, on espresso
const KEYLINE_LIGHT = '#1e140d' // espresso, on cream

// kind codes (src/lib/trees/types.ts)
const TREE = 0
const STUMP = 1
// cls codes = TRUNK_CLASSES index (src/lib/trees/trunk.ts)
const LARGE = 2
/** A species index no site carries — the "nothing selected" filter. */
const NO_SPECIES = -2

// ── features ───────────────────────────────────────────────────────────────

/** Every mapped site as a Point. Coordinates decode the snapshot's integer
 *  offsets: x = round((lon + 123) × 1e5), y = round((lat − 37) × 1e5); −1 =
 *  no coordinates published (skipped). Properties are only what the layers
 *  filter on and the click reads. */
export function siteFeatures(snap: TreesSnapshot): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const n = snap.id.length
  for (let i = 0; i < n; i++) {
    const x = snap.x[i]
    const y = snap.y[i]
    if (x < 0 || y < 0) continue
    features.push({
      type: 'Feature',
      // Integer arithmetic before the one division keeps five clean decimals.
      geometry: { type: 'Point', coordinates: [(x - 12_300_000) / 1e5, (y + 3_700_000) / 1e5] },
      properties: { id: snap.id[i], sp: snap.sp[i], kind: snap.kind[i], cls: snap.cls[i], nt: snap.nt[i], fl: snap.fl[i] },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ── layer specs ────────────────────────────────────────────────────────────

const isTree: mapboxgl.FilterSpecification = ['==', ['get', 'kind'], TREE]
const isStump: mapboxgl.FilterSpecification = ['==', ['get', 'kind'], STUMP]
const noSpecies: mapboxgl.FilterSpecification = ['==', ['get', 'sp'], NO_SPECIES]

const DOT_OPACITY = 0.75
const HEAT_OPACITY = 0.8

type TreeLayer = mapboxgl.CircleLayerSpecification | mapboxgl.HeatmapLayerSpecification

export const TREE_LAYERS: TreeLayer[] = [
  {
    id: 'trees-heat',
    type: 'heatmap',
    source: TREES_SOURCE,
    maxzoom: DOT_MINZOOM,
    filter: isTree,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, DOT_MINZOOM, 1.4],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, DOT_MINZOOM, 14],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(122,153,84,0)',
        0.4, MOSS_500,
        1, '#c9dba8',
      ],
      'heatmap-opacity': HEAT_OPACITY,
    },
  },
  {
    id: 'trees-dots',
    type: 'circle',
    source: TREES_SOURCE,
    minzoom: DOT_MINZOOM,
    filter: isTree,
    paint: {
      // small 2.5 · medium 3.5 · large 5 · not measured 2.5
      'circle-radius': ['match', ['get', 'cls'], 0, 2.5, 1, 3.5, 2, 5, 2.5],
      'circle-color': MOSS_500,
      'circle-opacity': DOT_OPACITY,
    },
  },
  {
    id: 'trees-stumps',
    type: 'circle',
    source: TREES_SOURCE,
    minzoom: STUMP_MINZOOM,
    filter: isStump,
    paint: {
      'circle-radius': 4,
      'circle-opacity': 0,
      'circle-stroke-color': BRICK_600,
      'circle-stroke-width': 1.5,
    },
  },
  {
    id: 'trees-species',
    type: 'circle',
    source: TREES_SOURCE,
    filter: noSpecies,
    paint: {
      'circle-radius': 3.5,
      'circle-color': MOSS_400,
      'circle-stroke-color': KEYLINE_DARK,
      'circle-stroke-width': 1,
    },
  },
]

/** Click + hover targets: the layers that draw a site you can point at. */
export const TREE_POINT_LAYER_IDS: readonly string[] = ['trees-dots', 'trees-stumps', 'trees-species']

// ── lenses ─────────────────────────────────────────────────────────────────

export interface LensPaint {
  filters: Record<string, mapboxgl.FilterSpecification>
  paint: Record<string, Record<string, unknown>>
  /** [minzoom, maxzoom] per layer — `setLayerZoomRange`, since a zoom floor
   *  is not a paint property. */
  zoom: Record<string, [number, number]>
}

/** The COMPLETE filter/paint/zoom state of every layer under a lens — each
 *  call names every value, so switching lenses never leaves an old one set.
 *    explore  the defaults; a selected species lights up at every zoom and
 *             the other street trees drop back to 0.25.
 *    equity   dots and heat at 0.35 — the neighborhood fill carries the lens.
 *    safety   large trunks only, stumps at every zoom, heat hidden. */
export function lensPaint(lens: Lens, speciesIdx: number | null, dark: boolean): LensPaint {
  const keyline = dark ? KEYLINE_DARK : KEYLINE_LIGHT
  const picked = lens === 'explore' && speciesIdx !== null && speciesIdx >= 0
  const speciesFilter: mapboxgl.FilterSpecification = picked
    ? ['all', isTree, ['==', ['get', 'sp'], speciesIdx]]
    : noSpecies

  const dotOpacity = lens === 'equity' ? 0.35 : picked ? 0.25 : DOT_OPACITY
  const heatOpacity = lens === 'safety' ? 0 : lens === 'equity' ? 0.35 : HEAT_OPACITY

  return {
    filters: {
      'trees-heat': isTree,
      'trees-dots': lens === 'safety' ? ['all', isTree, ['==', ['get', 'cls'], LARGE]] : isTree,
      'trees-stumps': isStump,
      'trees-species': speciesFilter,
    },
    paint: {
      'trees-heat': { 'heatmap-opacity': heatOpacity },
      'trees-dots': { 'circle-opacity': dotOpacity },
      'trees-stumps': { 'circle-stroke-opacity': 1 },
      'trees-species': { 'circle-stroke-color': keyline },
    },
    zoom: {
      'trees-heat': [0, DOT_MINZOOM],
      'trees-dots': [DOT_MINZOOM, 24],
      'trees-stumps': [lens === 'safety' ? 0 : STUMP_MINZOOM, 24],
      'trees-species': [0, 24],
    },
  }
}
