// src/views/Restaurants/mapLayers.ts
//
// The Restaurants map: layer specs for the three lenses plus the PURE feature
// builders that feed them (spec §4.3). No runtime imports beyond the view's
// own zero-import leaves, so every builder is node-testable.
//
// Every lens is a VISUAL RANK (the PR #183 idiom, Traffic Safety): layers
// PARTITION the storefronts — each is drawn once, at its highest rank — so a
// rank gets its own size, zoom floor and draw order, and the top rank is
// drawn LAST. Tooltips and clicks register on every rank (`*_LAYER_IDS`).
//
//   Turnover (default, snapshot): concentric hollow teal rings, one per
//     strict operator — the tree ring. 5+ and 4 at every zoom, 3 from 8.5
//     (largest drawn last, 5 keylined) → 2 (one thin ring) from 11.5 → 1
//     (a paper-500 dot, the city's texture and the denominator) from 12.5.
//     A lower rank never appears before a higher one (effectiveFloors).
//     (Floors and sizes live in MAP_TUNE — Jesse, Sept. 24 2026: the first
//     cut hid too much and drew the story rings too small to read.)
//     A brick center dot only when the CURRENT permit meets the repeat bar
//     (D5 — a storefront never inherits an earlier tenant's closure).
//   Closures (live latest reading + the snapshot's repeat flag): repeat bar
//     brick-600 every zoom, keyline + halo, drawn last → latest reading
//     Closure brick-400 from 8.5 → Conditional ochre-500 from 11.5 → Pass
//     moss-500 from 12.5. A place closed once and since cleared reads Pass —
//     it never stays red, and one closure is never on the every-zoom layer.
//   Owners: indigo-400 halos on the selected owner's storefronts, every
//     zoom; everything else stays pinpricks. NO connecting lines — a web
//     implies a hub, and the hub is a mailing address, never drawn.
//
// Never drawn: offsite-food / non-food permits (Q3a is STOREFRONT_WHERE),
// venue-list doors, and points outside the SF bbox (43 rows, A §5).

import type mapboxgl from 'mapbox-gl'
import type { Storefront, StorefrontOperator } from '@/lib/storefronts/types'
import type { Placard } from './placard'

// ── pigments ───────────────────────────────────────────────────────────────

/** View chrome + ring pigment on the cream basemap (spec D7: unclaimed). */
export const TEAL_700 = '#2e5856'
/** Ring pigment on the espresso basemap — teal-700 vanishes there. */
const TEAL_400 = '#8bb5b2'
export const PAPER_500 = '#a8926a'
export const BRICK_600 = '#963e30'
export const BRICK_400 = '#d17566'
export const OCHRE_500 = '#d4a435'
export const MOSS_500 = '#7a9954'
/** The ring pigment per theme — RingGlyph draws the map's rings at list size. */
export const RING_COLOR_DARK = TEAL_400
export const RING_COLOR_LIGHT = TEAL_700
/** Owner-lens halo (spec D7: unclaimed). */
export const INDIGO_400 = '#8a92b5'
const KEYLINE_DARK = '#f5ecd9' // paper, on espresso
const KEYLINE_LIGHT = '#1e140d' // espresso, on cream

export const RING_SOURCE = 'restaurant-rings'
export const PLACARD_SOURCE = 'restaurant-placards'
export const OWNER_SOURCE = 'restaurant-owners'
export const SELECTED_SOURCE = 'restaurant-selected'

// ── geography + display helpers ─────────────────────────────────────────────

/** SF land bbox — points outside it are junk coordinates (A §5). */
const SF_BBOX = { minLat: 37.7, maxLat: 37.84, minLng: -122.53, maxLng: -122.35 }

export function inSf(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= SF_BBOX.minLat && lat <= SF_BBOX.maxLat && lng >= SF_BBOX.minLng && lng <= SF_BBOX.maxLng
}

const titleWord = (w: string): string => {
  if (/^\d+(ST|ND|RD|TH)$/.test(w)) return w.toLowerCase() // 24TH → 24th
  if (/^\d/.test(w)) return w
  return w.charAt(0) + w.slice(1).toLowerCase()
}

/** A raw DPH address ('1148   MISSION ST', padded since July 2025) → a
 *  display line ('1148 Mission St'). The snapshot's own `address` wins
 *  wherever a storefront resolves; this is the live-only fallback. */
export function displayAddress(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.split(' ').map((w) => (w === w.toUpperCase() ? titleWord(w) : w)).join(' ')
}

/** A DBA as DPH writes it (often ALL CAPS) → display case, leaving mixed-case
 *  names exactly as published. */
export function displayName(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s || s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s\-/&(.])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/**
 * The current tenant: the most recently SEEN operator (latest lastDate). The
 * ONE authority for "who is here now" — every map tooltip, the rail, the
 * biography's owner and the storefront labels read it. Never the last entry
 * of `operators`: that array is ordered by firstDate, so it names the operator
 * that STARTED last — at 1800 Folsom St that was El Alambre #2 (last seen
 * June 2023) while Foods Co, the holder of the permit both closures sit on,
 * was still being inspected in 2026.
 */
export function currentOperator(s: Pick<Storefront, 'operators'>): StorefrontOperator | null {
  return s.operators.length ? s.operators.reduce((m, o) => (o.lastDate > m.lastDate ? o : m)) : null
}

/** The storefront biography's REAL width in px, for the fly-to offset:
 *  `w-[28rem]` (so Large Type widens it), capped by DetailPanelShell's
 *  `mobileCompact` max-width — 54vw on mobile, the viewport less its 2.5rem
 *  gutters on desktop. Pure so the offset math is testable without a DOM. */
export const STOREFRONT_PANEL_REM = 28
export function storefrontPanelPx(rootFontPx: number, viewportPx: number, mobile: boolean): number {
  const width = STOREFRONT_PANEL_REM * rootFontPx
  return Math.min(width, mobile ? viewportPx * 0.54 : viewportPx - 2.5 * rootFontPx)
}

// ── turnover: tree rings ────────────────────────────────────────────────────

/** Visual rank on the turnover lens: strict operators, clamped to 1…5
 *  (a storefront with 0 strict operators — only one-timers — is texture). */
export function ringRank(chainStrict: number): 1 | 2 | 3 | 4 | 5 {
  if (chainStrict >= 5) return 5
  if (chainStrict <= 1) return 1
  return chainStrict as 2 | 3 | 4
}

/** The strict chain as a tooltip line: "Almanac → Brewvino → Caprizza". */
export function chainLine(sf: Pick<Storefront, 'operators'>): string {
  return sf.operators.filter((o) => o.strict).map((o) => displayName(o.name)).join(' → ')
}

/**
 * Turnover features: every mapped storefront, ranked by its strict chain.
 * With a `bucket`, only that bucket's storefronts keep their rings (ranks
 * 3+); every other storefront drops out of the ring ranks, so the map shows
 * the bucket against the city's pinprick texture — no dim mask.
 */
export function turnoverFeatures(storefronts: readonly Storefront[], opts: { bucket?: string | null } = {}): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const sf of storefronts) {
    if (!inSf(sf.lat, sf.lng)) continue
    let rank = ringRank(sf.chainStrict)
    if (opts.bucket && rank >= 3 && sf.turnoverBucket !== opts.bucket) continue
    if (opts.bucket && rank < 3) rank = 1
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [sf.lng as number, sf.lat as number] },
      properties: {
        key: sf.key,
        address: sf.address,
        rank,
        chainStrict: sf.chainStrict,
        chainAll: sf.chainAll,
        chain: chainLine(sf),
        now: displayName(currentOperator(sf)?.name ?? ''),
        repeat: sf.repeatCurrent ? 1 : 0,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ── the tune: every size and zoom floor on the map, in one place ───────────

/** The knobs `?tune=1` exposes (MapTunePanel). Defaults are the shipped look;
 *  `applyMapTune` re-paints a live map with any other set. */
export interface MapTune {
  /** Multiplies every turnover ring's radius (1 = the first cut). */
  ringScale: number
  /** Multiplies every small dot: one-business storefronts, placards, owners. */
  dotScale: number
  /** Zoom floor for one-business storefronts, Pass placards and owner dots. */
  floor1: number
  /** Zoom floor for two-business storefronts and yellow placards. */
  floor2: number
  /** Zoom floor for three-business storefronts and closed placards. */
  floor3: number
}

/** Shipped look — Jesse's tune, Sept. 24 2026 (`?maptune=1.5,2,12.5,11.5,8.5`):
 *  the 3+-name story doors and closed places from zoom 8.5 (every practical
 *  zoom), two-name doors and yellow placards from 11.5 (just under the
 *  opening ~12.1 view), one-name doors and green placards from 12.5 (the
 *  first zoom-in step). */
export const DEFAULT_MAP_TUNE: Readonly<MapTune> = { ringScale: 1.5, dotScale: 2, floor1: 12.5, floor2: 11.5, floor3: 8.5 }

/** The floors a map actually uses. Ranks PARTITION the storefronts, so a
 *  lower rank showing before a higher one would hide the higher one's doors
 *  while plainer doors draw (the #183 rule). Each floor is therefore at
 *  least the floor of the rank above it: floor3 ≤ floor2 ≤ floor1, always. */
export function effectiveFloors(t: MapTune): { f1: number; f2: number; f3: number } {
  const f3 = t.floor3
  const f2 = Math.max(t.floor2, f3)
  return { f1: Math.max(t.floor1, f2), f2, f3 }
}

/** The URL knob for a shared tune: `?maptune=1.8,1.5,12,13,11`. */
export function parseMapTune(raw: string | null): MapTune {
  const n = (raw ?? '').split(',').map(Number)
  const ok = n.length === 5 && n.every((v) => Number.isFinite(v))
  if (!ok) return { ...DEFAULT_MAP_TUNE }
  const z = (v: number) => Math.min(14.5, Math.max(0, v))
  return { ringScale: Math.max(0.3, n[0]), dotScale: Math.max(0.3, n[1]), floor1: z(n[2]), floor2: z(n[3]), floor3: z(n[4]) }
}
export const serializeMapTune = (t: MapTune): string => [t.ringScale, t.dotScale, t.floor1, t.floor2, t.floor3].join(',')

/** Ring i's radius (px) at a zoom — rings step outward by a fixed gap so a
 *  5-ring storefront reads as a tree section, not a blob. The scale applies
 *  in full at city zoom and by its square root at street zoom, so a 5-ring
 *  door grows readable from afar without swallowing a block up close. */
const ringRadius = (i: number, s: number): mapboxgl.Expression =>
  ['interpolate', ['linear'], ['zoom'], 10, (1.5 + i * 1.6) * s, 13, (2 + i * 2.4) * s, 16, (3 + i * 3.4) * Math.sqrt(s)]

/** A small dot's radius from its floor up; stops stay ascending for any floor ≤ 14.5. */
const dotRadius = (floor: number, base: number, d: number): mapboxgl.Expression =>
  ['interpolate', ['linear'], ['zoom'], floor, base * d, 15, base * 1.6 * d, 18, base * 2.5 * d]

/** Ring ranks' zoom floors (spec §4.3, retuned Sept. 24 2026). */
export function ringMinZoom(t: MapTune): Readonly<Record<1 | 2 | 3 | 4 | 5, number>> {
  const { f1, f2, f3 } = effectiveFloors(t)
  return { 5: 0, 4: 0, 3: f3, 2: f2, 1: f1 }
}
export const RING_MIN_ZOOM = ringMinZoom(DEFAULT_MAP_TUNE)

function ringLayer(rank: 2 | 3 | 4 | 5, i: number, t: MapTune): mapboxgl.AnyLayer {
  const outer = i === rank
  return {
    id: `ring-r${rank}-${i}`,
    type: 'circle',
    source: RING_SOURCE,
    minzoom: ringMinZoom(t)[rank],
    filter: ['==', ['get', 'rank'], rank],
    paint: {
      // Rank 2 is ONE thin ring (spec §4.3), sized like ring 2.
      'circle-radius': ringRadius(rank === 2 ? 2 : i, t.ringScale),
      'circle-color': TEAL_400,
      // Hollow — but a transparent fill still hit-tests, so the OUTER ring of
      // each rank carries the tooltip and the click for the whole storefront.
      'circle-opacity': 0,
      'circle-stroke-color': rank === 5 && outer ? KEYLINE_DARK : TEAL_400,
      'circle-stroke-width': rank === 5 && outer ? 2 : rank === 2 ? 1 : 1.4,
      'circle-stroke-opacity': rank === 2 ? 0.7 : 0.9,
    },
  } as mapboxgl.AnyLayer
}

/** The hit layer of each turnover rank (its outermost ring), visual rank
 *  first — tooltips and clicks register on all five. */
export const RING_LAYER_IDS = ['ring-r5-5', 'ring-r4-4', 'ring-r3-3', 'ring-r2-2', 'ring-r1-dot'] as const

/** The repeat-bar center dot follows its storefront's zoom floor. Zoom is
 *  the TOP-LEVEL step input (Mapbox rejects zoom nested inside `case`). */
const rankAtLeast = (n: number): mapboxgl.Expression => ['case', ['>=', ['get', 'rank'], n], 1, 0]

/** The repeat dot shows only once its storefront's rings do. `step` needs
 *  strictly ascending stops, so floors that tie or cross are collapsed. */
function repeatDotOpacity(t: MapTune): mapboxgl.Expression {
  const { f1, f2, f3 } = effectiveFloors(t)
  const stops: [number, number][] = [[f3, 3], [f2, 2], [f1, 1]]
  const expr: unknown[] = ['step', ['zoom'], rankAtLeast(4)]
  let last = -1
  let min = 4
  for (const [z, r] of [...stops].sort((a, b) => a[0] - b[0])) {
    min = Math.min(min, r)
    if (z > last) { expr.push(z, rankAtLeast(min)); last = z } else expr[expr.length - 1] = rankAtLeast(min)
  }
  return expr as mapboxgl.Expression
}

export function buildTurnoverLayers(t: MapTune): mapboxgl.AnyLayer[] {
  return [
    {
      id: 'ring-r1-dot',
      type: 'circle',
      source: RING_SOURCE,
      minzoom: effectiveFloors(t).f1,
      filter: ['==', ['get', 'rank'], 1],
      paint: {
        'circle-radius': dotRadius(effectiveFloors(t).f1, 1.3, t.dotScale),
        'circle-color': PAPER_500,
        'circle-opacity': 0.7,
      },
    } as mapboxgl.AnyLayer,
    ringLayer(2, 2, t), // one thin ring, laid out as ring index 2 → id ring-r2-2
    ...[1, 2, 3].map((i) => ringLayer(3, i, t)),
    ...[1, 2, 3, 4].map((i) => ringLayer(4, i, t)),
    ...[1, 2, 3, 4, 5].map((i) => ringLayer(5, i, t)),
    {
      id: 'ring-repeat-dot',
      type: 'circle',
      source: RING_SOURCE,
      filter: ['==', ['get', 'repeat'], 1],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.6 * t.ringScale, 13, 2.2 * t.ringScale, 16, 3.4 * Math.sqrt(t.ringScale)],
        'circle-color': BRICK_600,
        'circle-opacity': repeatDotOpacity(t),
      },
    } as mapboxgl.AnyLayer,
  ]
}

export const TURNOVER_LAYERS: mapboxgl.AnyLayer[] = buildTurnoverLayers(DEFAULT_MAP_TUNE)

// ── closures: the latest published reading ──────────────────────────────────

/** Q3a row (one per storefront permit with a placard in the window), with the
 *  view's `last_pass` column: the latest date the permit had a Pass row. */
export interface MapPermitRow {
  permit_number: string
  dba?: string
  addr?: string
  lat?: string
  lng?: string
  last_date?: string
  last_pass?: string
}

/** Q3b row — every non-Pass reading in the window. */
export interface NonPassRow {
  permit_number: string
  inspection_date: string
  facility_rating_status: string
}

export interface LatestReading {
  latest: Placard
  /** Closed at least once in the window (the "Places closed" filter set). */
  closedInWindow: boolean
  /** Given a yellow placard at least once in the window. */
  yellowInWindow: boolean
}

/**
 * Each permit's LATEST published reading in the window, from complete data
 * (spec §3.3): the Q3b row on Q3a's last date, else Pass. On one date the
 * episode rule sorts Closure first, so a Pass (or a Conditional Pass) on the
 * same date is the later reading — "cleared the same day" reads Pass.
 */
export function latestReadings(permits: readonly MapPermitRow[], nonPass: readonly NonPassRow[]): Map<string, LatestReading> {
  const byPermit = new Map<string, NonPassRow[]>()
  for (const r of nonPass) {
    const list = byPermit.get(r.permit_number)
    if (list) list.push(r)
    else byPermit.set(r.permit_number, [r])
  }
  const out = new Map<string, LatestReading>()
  for (const p of permits) {
    const last = (p.last_date ?? '').slice(0, 10)
    const rows = byPermit.get(p.permit_number) ?? []
    const onLast = rows.filter((r) => r.inspection_date.slice(0, 10) === last)
    let latest: Placard = 'pass'
    if (onLast.length && (p.last_pass ?? '').slice(0, 10) !== last) {
      latest = onLast.some((r) => r.facility_rating_status === 'Conditional Pass') ? 'conditional' : 'closure'
    }
    out.set(p.permit_number, {
      latest,
      closedInWindow: rows.some((r) => r.facility_rating_status === 'Closure'),
      yellowInWindow: rows.some((r) => r.facility_rating_status === 'Conditional Pass'),
    })
  }
  return out
}

/** The closures lens's visual rank: 1 repeat bar · 2 closed · 3 yellow · 4 pass. */
export const PLACARD_MAP_RANK: Readonly<Record<Placard, 2 | 3 | 4>> = { closure: 2, conditional: 3, pass: 4 }

/** A live map point, resolved against the snapshot where it can be. */
export interface ClosureMapPoint {
  permit: string
  name: string
  address: string
  lat: number
  lng: number
  lastDate: string
  latest: Placard
  closedInWindow: boolean
  yellowInWindow: boolean
  /** Snapshot storefront key, or null when the door is not in the histories. */
  key: string | null
}

/**
 * Closures-lens features. Rank 1 comes from the SNAPSHOT (the current permit
 * meets the repeat bar, through `asOf`) and is drawn once — a live permit at
 * a rank-1 storefront is not drawn again. Ranks 2–4 are the live latest
 * readings. A `placard` filter keeps only places with that reading in the
 * window; a rank-1 storefront survives it only when one of its permits did.
 */
export function closureFeatures(p: {
  points: readonly ClosureMapPoint[]
  repeatStorefronts: readonly Storefront[]
  placard: 'closure' | 'conditional' | null
}): GeoJSON.FeatureCollection {
  const repeatKeys = new Set(p.repeatStorefronts.map((s) => s.key))
  const inFilter = (pt: Pick<ClosureMapPoint, 'closedInWindow' | 'yellowInWindow'>): boolean =>
    p.placard === null || (p.placard === 'closure' ? pt.closedInWindow : pt.yellowInWindow)
  const hitPermits = new Set(p.points.filter(inFilter).map((pt) => pt.permit))
  const liveByKey = new Map<string, ClosureMapPoint>()
  for (const pt of p.points) if (pt.key !== null && !liveByKey.has(pt.key)) liveByKey.set(pt.key, pt)
  const features: GeoJSON.Feature[] = []
  for (const sf of p.repeatStorefronts) {
    if (!inSf(sf.lat, sf.lng)) continue
    if (p.placard !== null && !sf.permits.some((id) => hitPermits.has(id))) continue
    const live = liveByKey.get(sf.key)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [sf.lng as number, sf.lat as number] },
      properties: {
        rank: 1,
        key: sf.key,
        permit: live?.permit ?? '',
        name: live?.name ?? displayName(currentOperator(sf)?.name ?? ''),
        address: sf.address,
        latest: live?.latest ?? '',
        lastDate: live?.lastDate ?? '',
      },
    })
  }
  for (const pt of p.points) {
    if (pt.key !== null && repeatKeys.has(pt.key)) continue
    if (!inFilter(pt) || !inSf(pt.lat, pt.lng)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
      properties: {
        rank: PLACARD_MAP_RANK[pt.latest],
        key: pt.key ?? '',
        permit: pt.permit,
        name: pt.name,
        address: pt.address,
        latest: pt.latest,
        lastDate: pt.lastDate,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export const PLACARD_POINT_LAYER_IDS = ['placard-repeat-core', 'placard-closure', 'placard-conditional', 'placard-pass'] as const

export function buildClosureLayers(t: MapTune): mapboxgl.AnyLayer[] {
  return [
  {
    id: 'placard-pass',
    type: 'circle',
    source: PLACARD_SOURCE,
    minzoom: effectiveFloors(t).f1,
    filter: ['==', ['get', 'rank'], 4],
    paint: {
      'circle-radius': dotRadius(effectiveFloors(t).f1, 1.5, t.dotScale),
      'circle-color': MOSS_500,
      'circle-opacity': 0.75,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'placard-conditional',
    type: 'circle',
    source: PLACARD_SOURCE,
    minzoom: effectiveFloors(t).f2,
    filter: ['==', ['get', 'rank'], 3],
    paint: {
      'circle-radius': dotRadius(effectiveFloors(t).f2, 1.9, t.dotScale),
      'circle-color': OCHRE_500,
      'circle-opacity': 0.9,
      'circle-stroke-width': 0.8,
      'circle-stroke-color': 'rgba(245,236,217,0.45)',
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'placard-closure',
    type: 'circle',
    source: PLACARD_SOURCE,
    minzoom: t.floor3,
    filter: ['==', ['get', 'rank'], 2],
    paint: {
      'circle-radius': dotRadius(t.floor3, 2.4, t.dotScale),
      'circle-color': BRICK_400,
      'circle-opacity': 0.95,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(245,236,217,0.5)',
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'placard-repeat-halo',
    type: 'circle',
    source: PLACARD_SOURCE,
    filter: ['==', ['get', 'rank'], 1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 10, 13, 15, 16, 24],
      'circle-color': BRICK_600,
      'circle-opacity': 0.28,
      'circle-blur': 0.6,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'placard-repeat-core',
    type: 'circle',
    source: PLACARD_SOURCE,
    filter: ['==', ['get', 'rank'], 1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13, 6.5, 16, 11],
      'circle-color': BRICK_600,
      'circle-opacity': 1,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 16, 2.4],
      'circle-stroke-color': KEYLINE_DARK,
    },
  } as mapboxgl.AnyLayer,
  ]
}

export const CLOSURE_LAYERS: mapboxgl.AnyLayer[] = buildClosureLayers(DEFAULT_MAP_TUNE)

// ── owners: halos ───────────────────────────────────────────────────────────

/** Owners-lens features: every mapped storefront; the selected owner's carry
 *  `hit: 1` (halo, every zoom), the rest are pinpricks from zoom 15. */
export function ownerFeatures(storefronts: readonly Storefront[], selected: ReadonlySet<string>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const sf of storefronts) {
    if (!inSf(sf.lat, sf.lng)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [sf.lng as number, sf.lat as number] },
      properties: {
        key: sf.key,
        address: sf.address,
        now: displayName(currentOperator(sf)?.name ?? ''),
        hit: selected.has(sf.key) ? 1 : 0,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export const OWNER_LAYER_IDS = ['owner-core', 'owner-dot'] as const

export function buildOwnerLayers(t: MapTune): mapboxgl.AnyLayer[] {
  return [
  {
    id: 'owner-dot',
    type: 'circle',
    source: OWNER_SOURCE,
    minzoom: effectiveFloors(t).f1,
    filter: ['==', ['get', 'hit'], 0],
    paint: {
      'circle-radius': dotRadius(effectiveFloors(t).f1, 1.3, t.dotScale),
      'circle-color': PAPER_500,
      'circle-opacity': 0.75,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'owner-halo',
    type: 'circle',
    source: OWNER_SOURCE,
    filter: ['==', ['get', 'hit'], 1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 13, 13, 16, 20],
      'circle-color': INDIGO_400,
      'circle-opacity': 0.32,
      'circle-blur': 0.5,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'owner-core',
    type: 'circle',
    source: OWNER_SOURCE,
    filter: ['==', ['get', 'hit'], 1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 13, 5, 16, 8],
      'circle-color': INDIGO_400,
      'circle-opacity': 1,
      'circle-stroke-width': 1.2,
      'circle-stroke-color': KEYLINE_DARK,
    },
  } as mapboxgl.AnyLayer,
  ]
}

export const OWNER_LAYERS: mapboxgl.AnyLayer[] = buildOwnerLayers(DEFAULT_MAP_TUNE)

/** Re-paint a live map with a tune: zoom floors + radii (+ the repeat dot's
 *  opacity step) of every tuned layer. Layers not yet added are skipped. */
export function applyMapTune(map: mapboxgl.Map, t: MapTune): void {
  for (const layer of [...buildTurnoverLayers(t), ...buildClosureLayers(t), ...buildOwnerLayers(t)]) {
    if (!map.getLayer(layer.id)) continue
    const l = layer as unknown as { id: string; minzoom?: number; paint: Record<string, mapboxgl.Expression> }
    map.setLayerZoomRange(l.id, l.minzoom ?? 0, 24)
    map.setPaintProperty(l.id, 'circle-radius', l.paint['circle-radius'])
    if (l.id === 'ring-repeat-dot') map.setPaintProperty(l.id, 'circle-opacity', l.paint['circle-opacity'])
  }
}

// ── the selected storefront ─────────────────────────────────────────────────

export const SELECTED_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'storefront-selected',
    type: 'circle',
    source: SELECTED_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 13, 16, 16, 26],
      'circle-opacity': 0,
      'circle-stroke-width': 2,
      'circle-stroke-color': KEYLINE_DARK,
      'circle-stroke-opacity': 0.9,
    },
  } as mapboxgl.AnyLayer,
]

export function selectedFeature(sf: Pick<Storefront, 'key' | 'lat' | 'lng'> | null): GeoJSON.FeatureCollection {
  if (!sf || !inSf(sf.lat, sf.lng)) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [sf.lng as number, sf.lat as number] }, properties: { key: sf.key } }],
  }
}

// ── theme-aware paint ───────────────────────────────────────────────────────

/** Paint that follows the theme — keylines paper on espresso / espresso on
 *  cream, rings teal-400 on espresso / teal-700 on cream (teal-700 vanishes
 *  on the dark basemap). Applied on `idle`, only where it differs (an
 *  unconditional set would repaint and fire `idle` again). */
export function themePaint(isDark: boolean): { layer: string; prop: string; value: string }[] {
  const keyline = isDark ? KEYLINE_DARK : KEYLINE_LIGHT
  const ring = isDark ? TEAL_400 : TEAL_700
  const out: { layer: string; prop: string; value: string }[] = []
  for (const layer of TURNOVER_LAYERS) {
    const m = /^ring-r(\d)-(\d)$/.exec(layer.id)
    if (!m) continue
    const keylined = m[1] === '5' && m[2] === '5'
    out.push({ layer: layer.id, prop: 'circle-stroke-color', value: keylined ? keyline : ring })
  }
  out.push({ layer: 'placard-repeat-core', prop: 'circle-stroke-color', value: keyline })
  out.push({ layer: 'owner-core', prop: 'circle-stroke-color', value: keyline })
  out.push({ layer: 'storefront-selected', prop: 'circle-stroke-color', value: keyline })
  return out
}

/** Legend swatches (the map's own pigments, so legend and paint can't drift). */
export const LEGEND = {
  ring: TEAL_400,
  ringLight: TEAL_700,
  pinprick: PAPER_500,
  repeat: BRICK_600,
  closure: BRICK_400,
  conditional: OCHRE_500,
  pass: MOSS_500,
  owner: INDIGO_400,
} as const
