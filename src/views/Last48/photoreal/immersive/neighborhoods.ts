// src/views/Last48/photoreal/immersive/neighborhoods.ts
//
// The navigator's NEIGHBORHOODS (Jesse, 2026-09-23: "we need neighborhoods
// in the places list"). All 41 of SF's Analysis Neighborhoods, each flown to
// through the SAME hand-tuned camera the flat map pages use
// (NEIGHBORHOOD_VIEWS, `?debug=map`-tuned May 2026) — one authored camera per
// neighborhood, translated from Mapbox's terms into the immersive director's:
//
//   - heading = Mapbox `bearing` (both are degrees clockwise from north, the
//     direction the camera looks);
//   - pitch   = Mapbox pitch − 90 (Mapbox 0 looks straight down, Cesium −90
//     does), clamped to the immersive band so no preset stares at the
//     horizon or straight at a roof;
//   - range   = a distance that scales with Mapbox zoom (one zoom level =
//     twice as close), anchored at 700 m for zoom 14.5 — the Hotspot range,
//     which frames a neighborhood — and clamped to what the photoreal tiles
//     hold up at. A Mapbox camera at the same zoom stands kilometres off;
//     the immersive page is about being among the buildings, not above them.
//
// Pure (no DOM, no Cesium); neighborhoods.test.ts pins the count, the city
// bounds and the clamps.
import { NEIGHBORHOOD_VIEWS } from '@/utils/mapDefaults'
import type { DatasetId, NormalizedEvent } from '@/types/last48'

export interface NeighborhoodStop {
  /** The Analysis Neighborhood name, exactly as the data spells it. */
  name: string
  lng: number
  lat: number
  headingDeg: number
  pitchDeg: number
  rangeM: number
}

export const NBHD_PITCH_MIN = -60
export const NBHD_PITCH_MAX = -25
export const NBHD_RANGE_MIN = 450
export const NBHD_RANGE_MAX = 1600

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const NEIGHBORHOODS: readonly NeighborhoodStop[] = Object.entries(NEIGHBORHOOD_VIEWS)
  .map(([name, v]) => ({
    name,
    lng: v.center.lng,
    lat: v.center.lat,
    headingDeg: ((v.bearing % 360) + 360) % 360,
    pitchDeg: clamp(v.pitch - 90, NBHD_PITCH_MIN, NBHD_PITCH_MAX),
    rangeM: Math.round(clamp(700 * 2 ** (14.5 - v.zoom), NBHD_RANGE_MIN, NBHD_RANGE_MAX)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** How many neighborhoods the navigator lists before "All 41 neighborhoods". */
export const NBHD_SHOWN = 6

/** Case- and accent-insensitive match — the one filter the navigator's search
 *  box applies to every list it owns (Places, Neighborhoods, Hotspots). */
export function matchesQuery(text: string, query: string): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = fold(query.trim())
  return q === '' || fold(text).includes(q)
}

/** Events per neighborhood in the loaded 48 h window, in each stream's OWN
 *  unit (LAST48_COUNT_EXPR): a Fire/EMS row is one dispatched UNIT, about
 *  two per call, so Fire/EMS counts distinct `call_number`s — counting rows
 *  would double it. `floor` is true when any stream's loaded rows fall short
 *  of its window (truncatedByDataset): the counts are then minimums and the
 *  navigator writes them "N+". */
export function neighborhoodCounts(
  events: readonly NormalizedEvent[],
  truncated: Partial<Record<DatasetId, boolean>>,
): { counts: Map<string, number>; floor: boolean } {
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const e of events) {
    if (!e.neighborhood) continue
    if (e.datasetId === 'fire-ems-dispatch') {
      const call = e.raw?.call_number
      const key = `${e.neighborhood}|${call != null ? String(call) : e.id}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    counts.set(e.neighborhood, (counts.get(e.neighborhood) ?? 0) + 1)
  }
  return { counts, floor: Object.values(truncated).some(Boolean) }
}
