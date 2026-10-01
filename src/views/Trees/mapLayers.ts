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
//                  recorded (small · medium · large · not measured), scaled
//                  by zoom with the class ratios kept.
//   trees-stumps   hollow brick rings (the hollow-ring idiom): Explore from
//                  zoom 12, Safety at every zoom, never under Equity (R23).
//   trees-species  the selected species at EVERY zoom, keylined, drawn last.
//
// The point layers PARTITION the sites: a tree is drawn — and hovered and
// clicked — by exactly one of dots / species, never both (with a species
// picked, the dots filter leaves that species out). Empty planting sites
// (kind 2) and shrubs (kind 3) are in the source — a `?tree=` deep link can
// still name one — but no layer's filter, under any lens, ever admits them.

import type mapboxgl from 'mapbox-gl'
import type { NeighborhoodAggregate, TreesSnapshot } from '@/lib/trees/types'
import { choroplethStops, stopColor } from './equityView'
import type { EquityRank, Lens } from './treesUrl'

export const TREES_SOURCE = 'trees-sites'

/** Street-tree dots appear from this zoom; the heatmap covers below it.
 *  Measured gate (plan Task 7 Step 7): raise to 14 if panning drops frames. */
export const DOT_MINZOOM = 13
export const STUMP_MINZOOM = 12

// ── pigments ───────────────────────────────────────────────────────────────

export const MOSS_500 = '#7a9954'
export const MOSS_400 = '#9db87a' // tokens.css --moss-400
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
/** A site kind no site carries — the "draw nothing" filter (R23). */
const NO_KIND = -1

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
const noSpecies: mapboxgl.FilterSpecification = ['all', isTree, ['==', ['get', 'sp'], NO_SPECIES]]
/** Admits no feature of any kind. A filtered-out layer draws, hovers and
 *  clicks nothing — which opacity 0 would not guarantee. */
const noSites: mapboxgl.FilterSpecification = ['==', ['get', 'kind'], NO_KIND]

const DOT_OPACITY = 0.75
const HEAT_OPACITY = 0.8

// Dot radii (px) by zoom, per trunk class [small, medium, large, not measured]
// (Jesse's browser walk, R11: the fixed 2.5–5 px merged into green ribbons at
// zoom 13–14). The class ratios hold at every stop.
const DOT_RADIUS_STOPS: readonly (readonly [number, readonly [number, number, number, number]])[] = [
  [13, [1.2, 1.7, 2.4, 1.2]],
  [15, [2.5, 3.5, 5, 2.5]],
  [17, [4, 5.5, 8, 4]],
]
/** The legend's dot radii (px): the zoom-15 stop, [small, medium, large]. */
export const LEGEND_DOT_RADII: readonly [number, number, number] = [
  DOT_RADIUS_STOPS[1][1][0], DOT_RADIUS_STOPS[1][1][1], DOT_RADIUS_STOPS[1][1][2],
]
/** The map's zoom as the legend needs it: 0 below STUMP_MINZOOM, 1 from
 *  stumps to DOT_MINZOOM, 2 from the dots up. A small integer, so the page
 *  re-renders only when a band is crossed. */
export function zoomBand(zoom: number): 0 | 1 | 2 {
  return zoom >= DOT_MINZOOM ? 2 : zoom >= STUMP_MINZOOM ? 1 : 0
}

export interface LegendRows {
  /** Trunk classes with a dot-size row. */
  classes: ('small' | 'medium' | 'large')[]
  /** The row saying unmeasured trunks draw at the smallest size. */
  unmeasured: boolean
  /** Heatmap only: the heat swatch and a "zoom in" line replace the dot rows. */
  zoomIn: boolean
  /** The stump ring row — only where stumps are drawn (never under Equity, R23). */
  stumps: boolean
  /** The picked species' swatch — it is drawn at EVERY zoom. */
  species: boolean
}

/** What the trees legend lists (the Equity lens has its own legend), so it
 *  never describes a mark that is not on screen. Explore below DOT_MINZOOM
 *  draws the heatmap only: no dot rows, the heat swatch and "zoom in"
 *  instead — but a picked species is drawn at every zoom, so its swatch stays.
 *  Stumps are drawn from STUMP_MINZOOM under Explore, at every zoom under
 *  Safety, and never under Equity (R23) — so the Equity row is never listed.
 *  Safety draws large trunks at every zoom and no species layer. */
export function legendDots(lens: Lens, band: 0 | 1 | 2, speciesPicked: boolean): LegendRows {
  if (lens === 'safety') return { classes: ['large'], unmeasured: false, zoomIn: false, stumps: true, species: false }
  const species = lens === 'explore' && speciesPicked
  const stumps = lens !== 'equity' && band >= 1
  if (band < 2) return { classes: [], unmeasured: false, zoomIn: true, stumps, species }
  return { classes: ['small', 'medium', 'large'], unmeasured: true, zoomIn: false, stumps, species }
}

/** The heatmap's colour ramp by density — ONE table for the layer's
 *  `heatmap-color` and the legend's swatch, so the two cannot drift. */
export const HEAT_COLOR_STOPS: readonly (readonly [number, string])[] = [
  [0, 'rgba(122,153,84,0)'],
  [0.4, MOSS_500],
  [1, '#c9dba8'],
]
/** The legend's heat swatch: the same stops as a CSS gradient. */
export const HEAT_SWATCH_CSS =
  `linear-gradient(90deg, ${HEAT_COLOR_STOPS.map(([d, c]) => `${c} ${Math.round(d * 100)}%`).join(', ')})`

/** Stump ring radius by zoom — always larger than a small dot at that zoom. */
const STUMP_RADIUS_STOPS: readonly (readonly [number, number])[] = [[13, 2.2], [15, 4], [17, 6.5]]
/** Selected-species radius by zoom — no zoom floor, so it starts lower. */
const SPECIES_RADIUS_STOPS: readonly (readonly [number, number])[] = [[11, 1.5], [13, 2], [15, 3.5], [17, 6]]

const byZoom = (stops: readonly (readonly [number, unknown])[]): mapboxgl.ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([z, v]) => [z, v])] as mapboxgl.ExpressionSpecification

const dotRadius = byZoom(DOT_RADIUS_STOPS.map(([z, [s, m, l, u]]) =>
  [z, ['match', ['get', 'cls'], 0, s, 1, m, 2, l, u]] as const))

// Heatmap — FIRST TUNE, reasoned from the numbers, awaiting a visual pass.
// ~136,000 mapped street trees over ~120 km² (≈ 1,130/km²; the dense grids
// ≈ 2,500, the thin hills ≈ 300). Mapbox's kernel peaks at weight ×
// intensity × 0.399 and integrates to ≈ 0.7 × radius², so the density a
// pixel reads is ≈ 0.28 × weight × intensity × (points per px²) × radius².
// Radii hold ~250–300 m on the ground across zooms (Mapbox GL is 512-px
// tiles: ≈ 30 m/px at zoom 11, 15 at 12, 7.5 at 13 at SF's latitude), and
// intensity rises only enough to offset the 4× drop in points per px² per
// zoom. At zoom 12 that puts a dense grid near 0.9 of the ramp, the citywide
// average near 0.4 and a thin area near 0.1 — texture, never a flat fill.
const HEAT_WEIGHT = 0.014
const HEAT_INTENSITY_STOPS: readonly (readonly [number, number])[] = [[10, 0.7], [11, 1], [12, 1.25], [13, 1.8]]
const HEAT_RADIUS_STOPS: readonly (readonly [number, number])[] = [[10, 6], [11, 10], [12, 18], [13, 30]]

type TreeLayer = mapboxgl.CircleLayerSpecification | mapboxgl.HeatmapLayerSpecification

export const TREE_LAYERS: TreeLayer[] = [
  {
    id: 'trees-heat',
    type: 'heatmap',
    source: TREES_SOURCE,
    maxzoom: DOT_MINZOOM,
    filter: isTree,
    paint: {
      'heatmap-weight': HEAT_WEIGHT,
      'heatmap-intensity': byZoom(HEAT_INTENSITY_STOPS),
      'heatmap-radius': byZoom(HEAT_RADIUS_STOPS),
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        ...HEAT_COLOR_STOPS.flatMap(([d, c]) => [d, c]),
      ] as mapboxgl.ExpressionSpecification,
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
      'circle-radius': dotRadius,
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
      'circle-radius': byZoom(STUMP_RADIUS_STOPS),
      'circle-opacity': 0,
      'circle-stroke-color': BRICK_600,
      'circle-stroke-width': byZoom([[13, 1], [15, 1.5]]),
    },
  },
  {
    id: 'trees-species',
    type: 'circle',
    source: TREES_SOURCE,
    filter: noSpecies,
    paint: {
      'circle-radius': byZoom(SPECIES_RADIUS_STOPS),
      'circle-color': MOSS_400,
      'circle-stroke-color': KEYLINE_DARK,
      'circle-stroke-width': byZoom([[11, 0.5], [15, 1]]),
    },
  },
]

/** Click + hover targets: the layers that draw a site you can point at. */
export const TREE_POINT_LAYER_IDS: readonly string[] = ['trees-dots', 'trees-stumps', 'trees-species']

// ── the selected site (the tree card's ring) ───────────────────────────────

/** One snapshot site's point: the same decode as siteFeatures, or null when
 *  the city published no coordinates (−1). */
export function siteLngLat(x: number, y: number): [number, number] | null {
  if (x < 0 || y < 0) return null
  return [(x - 12_300_000) / 1e5, (y + 3_700_000) / 1e5]
}

export const SELECTED_SOURCE = 'trees-selected'
export const SELECTED_KEYLINE_LAYER = 'trees-selected-keyline'
export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** The ring's radius by zoom — always wider than the largest dot at that zoom. */
const SELECTED_RADIUS_STOPS: readonly (readonly [number, number])[] = [[11, 6], [13, 7], [15, 10], [17, 14]]

/** A paper (dark) / espresso (light) keyline under a moss ring, at every
 *  zoom, drawn above every tree layer (its source is added after theirs).
 *  The keyline colour follows the theme through `selectedKeyline`, applied
 *  on idle only when it differs. Not a click target. */
export const SELECTED_LAYERS: mapboxgl.CircleLayerSpecification[] = [
  {
    id: SELECTED_KEYLINE_LAYER,
    type: 'circle',
    source: SELECTED_SOURCE,
    paint: {
      'circle-radius': byZoom(SELECTED_RADIUS_STOPS),
      'circle-opacity': 0,
      'circle-stroke-color': KEYLINE_DARK,
      'circle-stroke-width': 4.5,
    },
  },
  {
    id: 'trees-selected',
    type: 'circle',
    source: SELECTED_SOURCE,
    paint: {
      'circle-radius': byZoom(SELECTED_RADIUS_STOPS),
      'circle-opacity': 0,
      'circle-stroke-color': MOSS_500,
      'circle-stroke-width': 2,
    },
  },
]

export function selectedKeyline(dark: boolean): string {
  return dark ? KEYLINE_DARK : KEYLINE_LIGHT
}

export function selectedFeature(center: [number, number] | null): GeoJSON.FeatureCollection {
  if (!center) return EMPTY_FC
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: center }, properties: {} }] }
}

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
 *    explore  the defaults; a selected species lights up at every zoom (and
 *             leaves the dots layer, so each tree is drawn and hit once)
 *             while the other street trees drop back to 0.25.
 *    equity   dots and heat at 0.35 — the neighborhood fill carries the lens;
 *             no stump rings (R23): the layer's filter admits nothing, so a
 *             hidden stump can be neither hovered nor clicked.
 *    safety   large trunks only, at EVERY zoom (~8,600 — the lens is never
 *             empty at the default view; R13); stumps at every zoom; heat
 *             hidden; no species layer. */
export function lensPaint(lens: Lens, speciesIdx: number | null, dark: boolean): LensPaint {
  const keyline = dark ? KEYLINE_DARK : KEYLINE_LIGHT
  const picked = lens === 'explore' && speciesIdx !== null && speciesIdx >= 0

  const dotsFilter: mapboxgl.FilterSpecification =
    lens === 'safety' ? ['all', isTree, ['==', ['get', 'cls'], LARGE]]
      : picked ? ['all', isTree, ['!=', ['get', 'sp'], speciesIdx]]
        : isTree
  const speciesFilter: mapboxgl.FilterSpecification = picked
    ? ['all', isTree, ['==', ['get', 'sp'], speciesIdx]]
    : noSpecies

  const dotOpacity = lens === 'equity' ? 0.35 : picked ? 0.25 : DOT_OPACITY
  const heatOpacity = lens === 'safety' ? 0 : lens === 'equity' ? 0.35 : HEAT_OPACITY

  return {
    filters: {
      'trees-heat': isTree,
      'trees-dots': dotsFilter,
      'trees-stumps': lens === 'equity' ? noSites : isStump,
      'trees-species': speciesFilter,
    },
    paint: {
      'trees-heat': { 'heatmap-opacity': heatOpacity },
      'trees-dots': { 'circle-opacity': dotOpacity },
      'trees-species': { 'circle-stroke-color': keyline },
    },
    zoom: {
      'trees-heat': [0, DOT_MINZOOM],
      'trees-dots': [lens === 'safety' ? 0 : DOT_MINZOOM, 24],
      'trees-stumps': [lens === 'safety' ? 0 : STUMP_MINZOOM, 24],
      'trees-species': [0, 24],
    },
  }
}

// ── the equity choropleth ──────────────────────────────────────────────────
//
// Its OWN source (the 41 neighborhood polygons), drawn only under the Equity
// lens — the page hands useMapLayer an EMPTY collection otherwise (never
// null: the hook ignores null after the first population). All three layers
// go BELOW the basemap labels (`belowLabels`) — a dense fill on top muddies
// every label — and so below the tree layers too.
//
//   trees-equity-fill      the moss ramp (per theme: pale → deep on cream,
//                          dim → bright on espresso — R15), unflagged only,
//                          coloured by a `match` on the name (re-ranking
//                          re-paints: the paint is pushed, the data is not
//                          rebuilt).
//   trees-equity-flagged   the demographic underlay's park-exclusion HATCH
//                          for flagged neighborhoods (the image is registered
//                          by DemographicUnderlay's ensureHatchPattern; its id
//                          comes in as `hatchImage`, so this file stays pure).
//   trees-equity-selected  the `?nh=` neighborhood's outline, selection ochre.
//
// Filters are static (`flagged` is stamped on the features); everything that
// changes with the measure, the theme or the selection is PAINT, because
// useMapLayer pushes paint on a layer-config change but not filters.

export const EQUITY_SOURCE = 'trees-equity'
export const CHOROPLETH_LAYER_ID = 'trees-equity-fill'
export const EQUITY_HATCH_LAYER_ID = 'trees-equity-flagged'
export const EQUITY_OUTLINE_LAYER_ID = 'trees-equity-selected'
export const OCHRE_500 = '#d4a435'
const CLEAR = 'rgba(0,0,0,0)'

/** The rail's and legend's flagged swatch, in CSS: the same paper-500
 *  stripes (≈55%) on a ≈10% wash as the map's hatch image. */
export const HATCH_SWATCH_CSS =
  'repeating-linear-gradient(45deg, rgba(168,146,106,0.55) 0 1.4px, rgba(168,146,106,0.10) 1.4px 4px)'

/** The boundary polygons with only the join name (`nhood`) and the flag. A
 *  polygon with no aggregate row is unflagged and paints clear (the match
 *  fallback). */
export function equityFeatures(
  boundaries: GeoJSON.FeatureCollection | null,
  rows: readonly NeighborhoodAggregate[],
): GeoJSON.FeatureCollection {
  if (!boundaries) return EMPTY_FC
  const flagged = new Set(rows.filter((r) => r.flag !== null).map((r) => r.name))
  return {
    type: 'FeatureCollection',
    features: boundaries.features.map((f) => {
      const nhood = String(f.properties?.nhood ?? '')
      return { type: 'Feature', geometry: f.geometry, properties: { nhood, flagged: flagged.has(nhood) } }
    }),
  }
}

/** `fill-color`: a `match` on the neighborhood name, each unflagged row
 *  coloured by its step on the quantile stops. Flagged and unknown names fall
 *  through to clear (the hatch layer draws the flagged ones). */
export function choroplethFill(
  rows: readonly NeighborhoodAggregate[], by: EquityRank, dark: boolean,
): mapboxgl.ExpressionSpecification | string {
  const stops = choroplethStops(rows, by, dark)
  const pairs = rows.filter((r) => r.flag === null).flatMap((r) => [r.name, stopColor(r[by], stops)])
  // An empty match is an invalid expression.
  if (pairs.length === 0) return CLEAR
  return ['match', ['get', 'nhood'], ...pairs, CLEAR] as mapboxgl.ExpressionSpecification
}

export function equityLayers(o: {
  rows: readonly NeighborhoodAggregate[]
  by: EquityRank
  dark: boolean
  selected: string | null
  hatchImage: string
}): (mapboxgl.FillLayerSpecification | mapboxgl.LineLayerSpecification)[] {
  return [
    {
      id: CHOROPLETH_LAYER_ID,
      type: 'fill',
      source: EQUITY_SOURCE,
      filter: ['!=', ['get', 'flagged'], true],
      paint: {
        'fill-color': choroplethFill(o.rows, o.by, o.dark),
        // The cream basemap washes a translucent fill toward pastel (CLAUDE.md, Maps).
        'fill-opacity': o.dark ? 0.5 : 0.8,
      },
    },
    {
      id: EQUITY_HATCH_LAYER_ID,
      type: 'fill',
      source: EQUITY_SOURCE,
      filter: ['==', ['get', 'flagged'], true],
      paint: { 'fill-pattern': o.hatchImage, 'fill-opacity': 1 },
    },
    {
      id: EQUITY_OUTLINE_LAYER_ID,
      type: 'line',
      source: EQUITY_SOURCE,
      paint: {
        'line-color': OCHRE_500,
        'line-width': 2.5,
        'line-opacity': o.selected === null ? 0 : ['case', ['==', ['get', 'nhood'], o.selected], 1, 0],
      },
    },
  ]
}
