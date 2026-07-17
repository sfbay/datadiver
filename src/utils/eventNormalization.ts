// src/utils/eventNormalization.ts
//
// Maps raw Socrata rows to NormalizedEvent. Each dataset has its own
// schema; the normalizer is dataset-specific. The mapper picks out the
// canonical fields (timestamp, location, callType, headline) for use
// in FLOW/HOTSPOTS rendering while preserving the original row in `raw`
// for the detail panel.

import type { DatasetId, NormalizedEvent } from '@/types/last48'
// Relative + .js-suffixed (not the @ alias): this module is shared with the
// alerts cron via api/_lib, which resolves runtime imports Node-ESM style.
import { parseSfLocal } from './sfTime.js'

interface RawCoord {
  longitude?: string | number
  latitude?: string | number
}

/**
 * Parse a Socrata location field to { lon, lat }, or undefined.
 *
 * Socrata serves geo in two formats depending on the dataset:
 *   1. "POINT (lon lat)" WKT string (Fire/EMS Dispatch, 311 Cases)
 *   2. GeoJSON object { type: 'Point', coordinates: [lon, lat] }
 *      (911 Realtime / Historical use this for `intersection_point`)
 */
export function parsePoint(p: unknown): { lon: number; lat: number } | undefined {
  if (typeof p === 'string') {
    const match = p.match(/POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i)
    if (match) return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) }
    return undefined
  }
  if (p && typeof p === 'object') {
    const obj = p as { type?: string; coordinates?: unknown }
    if (
      obj.type === 'Point' &&
      Array.isArray(obj.coordinates) &&
      obj.coordinates.length >= 2 &&
      typeof obj.coordinates[0] === 'number' &&
      typeof obj.coordinates[1] === 'number'
    ) {
      return { lon: obj.coordinates[0], lat: obj.coordinates[1] }
    }
  }
  return undefined
}

/** Pull a coord pair from any of Socrata's location-field aliases */
function coords(row: Record<string, unknown>, fields: RawCoord = {}): { lon?: number; lat?: number } {
  const point =
    parsePoint(row.point) ||
    parsePoint(row.case_location) ||
    parsePoint(row.intersection) ||
    parsePoint(row.intersection_point) || // 911 Realtime/Historical
    parsePoint(row.location)
  if (point) return { lon: point.lon, lat: point.lat }
  const lon = fields.longitude ?? row.longitude ?? row.long ?? row.lon
  const lat = fields.latitude ?? row.latitude ?? row.lat
  return {
    lon: lon != null ? parseFloat(String(lon)) : undefined,
    lat: lat != null ? parseFloat(String(lat)) : undefined,
  }
}

function parseTimestamp(s: unknown): { iso: string; ms: number } | null {
  if (typeof s !== 'string') return null
  // DataSF datetimes are FLOATING SF-local strings — Date.parse would read
  // them in the host timezone (UTC on the cron, the viewer's zone in the
  // browser) and skew every epoch by hours. See src/utils/sfTime.ts.
  const ms = parseSfLocal(s)
  if (isNaN(ms)) return null
  return { iso: s, ms }
}

/**
 * Normalize a raw SF street-location string into a readable, title-cased
 * label. Handles the three shapes the digest streams publish:
 *   911 (intersection_name): "19TH ST \ DOLORES ST"
 *   Fire/EMS (address):      "OFARRELL ST/SHANNON ST"
 *   311 (address):           "455 MINNA ST, SAN FRANCISCO, CA 94103"
 * Returns undefined when there's nothing usable (caller falls back to
 * neighborhood). Title-casing the SCREAMING-CAPS source keeps the serif
 * digest email readable; "\b[a-z]" only upcases word-initial letters so
 * "19th" stays "19th" (not "19Th").
 */
export function cleanStreetLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw
    .split(',')[0] // drop ", SAN FRANCISCO, CA 94103" tail on 311 addresses
    .replace(/\s*[\\/]\s*/g, ' & ') // intersection separators "\" / "/" -> "&"
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return undefined
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function extractPriority(row: Record<string, unknown>): string | undefined {
  // SF 911 CAD rows expose priority on one of these columns depending on
  // dataset version. Prefer the final assignment over the original.
  const v = row.priority_final ?? row.priority_original ?? row.priority
  if (typeof v === 'string' && v.length > 0) return v.toUpperCase()
  return undefined
}

export function normalizeEvent(
  datasetId: DatasetId,
  row: Record<string, unknown>
): NormalizedEvent | null {
  switch (datasetId) {
    case '911-realtime': {
      const t = parseTimestamp(row.received_datetime)
      if (!t) return null
      const c = coords(row)
      // 911 lifecycle: presence of a `disposition` field marks the call as
      // closed (the call had a final outcome assigned: CIT, ADV, NCR, etc.).
      // ~79% of 911 calls close within 48h; the remaining open calls are
      // editorially interesting — they represent active or long-duration
      // situations.
      const disposition = typeof row.disposition === 'string' ? row.disposition : undefined
      const closeAt = parseTimestamp(row.close_datetime)?.ms
      const state: 'open' | 'closed' = disposition ? 'closed' : 'open'
      const priority = extractPriority(row)
      return {
        id: `911-realtime:${row.cad_number ?? row.dispatch_id ?? row.id}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.analysis_neighborhood as string | undefined,
        address: cleanStreetLabel(row.intersection_name),
        longitude: c.lon,
        latitude: c.lat,
        callType: row.call_type_final_desc as string | undefined,
        headline: (row.call_type_final_desc as string | undefined) ?? '911 dispatch',
        state,
        closeAt,
        disposition,
        priority,
        raw: row,
      }
    }

    case 'fire-ems-dispatch': {
      const t = parseTimestamp(row.received_dttm)
      if (!t) return null
      const c = coords(row)
      return {
        id: `fire-ems-dispatch:${row.call_number ?? row.unit_id}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.neighborhoods_analysis_boundaries as string | undefined,
        address: cleanStreetLabel(row.address),
        longitude: c.lon,
        latitude: c.lat,
        callType: row.call_type as string | undefined,
        headline: (row.call_type as string | undefined) ?? 'Fire/EMS dispatch',
        raw: row,
      }
    }

    case '311-cases': {
      const t = parseTimestamp(row.requested_datetime)
      if (!t) return null
      const c = coords(row)
      return {
        id: `311-cases:${row.service_request_id}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.neighborhoods_sffind_boundaries as string | undefined,
        address: cleanStreetLabel(row.address),
        longitude: c.lon,
        latitude: c.lat,
        callType: row.service_subtype as string | undefined,
        headline: (row.service_subtype as string | undefined) ?? (row.service_name as string | undefined) ?? '311 case',
        raw: row,
      }
    }
  }
}
