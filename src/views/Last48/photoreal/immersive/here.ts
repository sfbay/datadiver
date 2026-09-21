// src/views/Last48/photoreal/immersive/here.ts
//
// The "here" reading's pure parts (Round B §3): what the last 48 hours
// held within 300 m of a clicked point, one line of ACS context for its
// neighborhood, and the corner the geocoder names. Cheap by construction:
// the events are already in memory, the ACS row is the committed JSON, and
// the geocoder's answer is one string.
import { LAST48_DATASETS, type DatasetId, type NormalizedEvent } from '@/types/last48'
import { STREAM_WORD } from './streamWords'

export const HERE_RADIUS_M = 300
const DEG_LAT_M = 111_320

/** Counts by stream within `radiusM` of the point. Equirectangular at the
 *  point's own latitude — exact enough at 300 m. Unlocated rows never count. */
export function nearbyCounts(
  events: readonly NormalizedEvent[], lng: number, lat: number, radiusM: number = HERE_RADIUS_M,
): Record<DatasetId, number> {
  const out = Object.fromEntries(LAST48_DATASETS.map((id) => [id, 0])) as Record<DatasetId, number>
  const kx = Math.cos(lat * Math.PI / 180)
  const r2 = (radiusM / DEG_LAT_M) ** 2
  for (const e of events) {
    if (e.longitude == null || e.latitude == null) continue
    const dx = (e.longitude - lng) * kx, dy = e.latitude - lat
    if (dx * dx + dy * dy <= r2 && e.datasetId in out) out[e.datasetId] += 1
  }
  return out
}

/** `911 dispatch 4 · Fire/EMS 1 · 311 case 2`, zeros skipped; all zero →
 *  `quiet here` (absence stated, never a blank). */
export function formatNearby(counts: Record<DatasetId, number>): string {
  const parts = LAST48_DATASETS.filter((id) => counts[id] > 0).map((id) => `${STREAM_WORD[id]} ${counts[id]}`)
  return parts.length ? parts.join(' · ') : 'quiet here'
}

/** `Median rent $2,340 · 18% over 65` from the committed ACS neighborhood row. */
export function acsLine(row: { medianRent?: number; pctOver65?: number } | undefined): string | null {
  if (!row) return null
  const parts: string[] = []
  if (row.medianRent != null && Number.isFinite(row.medianRent)) parts.push(`Median rent $${Math.round(row.medianRent).toLocaleString('en-US')}`)
  if (row.pctOver65 != null && Number.isFinite(row.pctOver65)) parts.push(`${Math.round(row.pctOver65)}% over 65`)
  return parts.length ? parts.join(' · ') : null
}

/** The first feature's `properties.name` from a Mapbox Geocoding v6 reverse
 *  response, as `near 445 Minna Street`. Anything malformed → null. */
export function cornerFromGeocode(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const props = (features[0] as { properties?: { name?: unknown } })?.properties
  const name = props?.name
  return typeof name === 'string' && name.trim() ? `near ${name.trim()}` : null
}
