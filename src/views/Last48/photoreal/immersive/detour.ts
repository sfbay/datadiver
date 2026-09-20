// src/views/Last48/photoreal/immersive/detour.ts
//
// A DETOUR (Round B §2) is a camera destination that is not a stop: the
// director flies there and drifts as usual, but the carousel keeps its
// active card, ?event= is untouched and play is paused. Places bring their
// own authored camera; hotspots get one house camera (heading = the site's
// default bearing, a moderate pitch, a neighborhood-scale range). `key` is
// what the URL and the rail's active tile agree on.
import type { Place } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

export interface DetourTarget {
  /** `place:<id>` or `hot:<neighborhood>`. */
  key: string
  lng: number
  lat: number
  headingDeg: number
  pitchDeg: number
  rangeM: number
}

/** SF_DEFAULT_BEARING, rounded — the way every DataDiver map first faces. */
export const HOTSPOT_HEADING_DEG = 20
export const HOTSPOT_PITCH_DEG = -35

export function detourFromPlace(p: Place): DetourTarget {
  return { key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM }
}

export function detourFromHotspot(h: Hotspot): DetourTarget {
  return { key: `hot:${h.neighborhood}`, lng: h.lng, lat: h.lat, headingDeg: HOTSPOT_HEADING_DEG, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M }
}

/** Four decimals ≈ 11 m: a hotspot centroid moves a few metres per poll and
 *  the director must not re-fly an 18 s leg for that. */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
export function sameDetour(a: DetourTarget | null, b: DetourTarget | null): boolean {
  if (a == null || b == null) return a === b
  return a.key === b.key && r4(a.lng) === r4(b.lng) && r4(a.lat) === r4(b.lat)
    && a.headingDeg === b.headingDeg && a.pitchDeg === b.pitchDeg && a.rangeM === b.rangeM
}
