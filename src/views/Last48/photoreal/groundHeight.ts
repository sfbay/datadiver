// src/views/Last48/photoreal/groundHeight.ts
//
// The ONE door every photoreal reader of the tile surface goes through.
// `Cesium3DTileset.getHeight` answers from whatever tiles are resident, and
// under a point whose tiles have not streamed in it can return nonsense —
// measured 2026-09-23 at the start of a flight: −25,289 m for a stop in SF.
// That single reading hid the hero Beacon (its anchor projected far below
// the canvas), put "Altitude 25,453 m" on the telemetry strip, and set the
// director's first aim guess 25 km underground. A reading outside what San
// Francisco's surface can be is therefore NO reading.
//
// Heights are above the WGS84 ellipsoid, which sits ~32 m above the geoid
// here: the Bay reads about −35 m, Mount Davidson's summit about +250 m, and
// rooftops count (getHeight hits buildings) — Sutro Tower's top is the city's
// highest surface at roughly +520 m. The band leaves room on both sides.
import type { Cartographic, Cesium3DTileset, Scene } from 'cesium'

export const GROUND_MIN_M = -100
export const GROUND_MAX_M = 600

/** The reading if San Francisco's surface could be there, else undefined. */
export function plausibleGround(h: number | null | undefined): number | undefined {
  return h != null && Number.isFinite(h) && h >= GROUND_MIN_M && h <= GROUND_MAX_M ? h : undefined
}

/** `tileset.getHeight`, guarded: a throw (picking can) or an implausible
 *  value both come back as undefined — "no tile has answered yet". */
export function tileGroundM(tileset: Cesium3DTileset | null | undefined, carto: Cartographic, scene: Scene): number | undefined {
  if (!tileset) return undefined
  try { return plausibleGround(tileset.getHeight(carto, scene)) } catch { return undefined }
}
