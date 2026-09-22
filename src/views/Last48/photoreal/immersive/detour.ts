// src/views/Last48/photoreal/immersive/detour.ts
//
// A DETOUR (Round B §2) is a camera destination that is not a stop: the
// director flies there and drifts as usual, but the carousel keeps its
// active card, ?event= is untouched and play is paused. Places bring their
// own authored camera (a postcard heading picked per landmark); hotspots
// bring a pitch and a neighborhood-scale range but NO heading — they arrive
// facing the way the camera flew, exactly as a stop does. `key` is what the
// URL and the rail's active tile agree on.
import type { Place } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

export interface DetourTarget {
  /** `place:<id>` or `hot:<neighborhood>`. */
  key: string
  lng: number
  lat: number
  /** Authored arrival heading, degrees clockwise from north — or null for
   *  "arrive facing travel" (see arrivalHeadingDeg). */
  headingDeg: number | null
  pitchDeg: number
  rangeM: number
}

export const HOTSPOT_PITCH_DEG = -35

export function detourFromPlace(p: Place): DetourTarget {
  return { key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM }
}

/** A hotspot is a neighborhood the DATA picked, so there is no composed view
 *  to arrive at — it used to arrive at a fixed heading of 20 (the site's
 *  default map bearing), which swung the camera sideways across every
 *  flight that was not already heading north-north-east. Sept. 21 2026
 *  (Jesse: "look where you're flying"): no heading, so the leg arrives
 *  facing its own travel. */
export function detourFromHotspot(h: Hotspot): DetourTarget {
  return { key: `hot:${h.neighborhood}`, lng: h.lng, lat: h.lat, headingDeg: null, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M }
}

/** The heading a leg ARRIVES with — the one rule for stops and detours:
 *  an authored heading (a Place) wins; otherwise (a stop, a Hotspot) the leg
 *  arrives facing the bearing it flew, so the flight reads as forward motion
 *  with the heading held; except the FIRST leg of a session, which keeps the
 *  house heading — a bearing from Cesium's default camera, out over the Bay,
 *  would face the East Bay. `travelDeg` is a thunk because it reads the live
 *  camera, and the first leg must not. */
export function arrivalHeadingDeg(
  authored: number | null,
  o: { firstLeg: boolean; houseDeg: number; travelDeg: () => number },
): number {
  if (authored != null) return authored
  return o.firstLeg ? o.houseDeg : o.travelDeg()
}

/** Within 1e-4° (≈11 m): a hotspot centroid moves a few metres per poll and
 *  the director must not re-fly an 18 s leg for that. */
export function sameDetour(a: DetourTarget | null, b: DetourTarget | null): boolean {
  if (a == null || b == null) return a === b
  return a.key === b.key && Math.abs(a.lng - b.lng) < 1e-4 && Math.abs(a.lat - b.lat) < 1e-4
    && a.headingDeg === b.headingDeg && a.pitchDeg === b.pitchDeg && a.rangeM === b.rangeM
}
