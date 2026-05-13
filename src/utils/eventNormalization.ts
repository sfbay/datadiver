// src/utils/eventNormalization.ts
//
// Maps raw Socrata rows to NormalizedEvent. Each dataset has its own
// schema; the normalizer is dataset-specific. The mapper picks out the
// canonical fields (timestamp, location, callType, headline) for use
// in FLOW/HOTSPOTS rendering while preserving the original row in `raw`
// for the detail panel.

import type { DatasetId, NormalizedEvent } from '@/types/last48'

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
function parsePoint(p: unknown): { lon: number; lat: number } | undefined {
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
  const ms = Date.parse(s)
  if (isNaN(ms)) return null
  return { iso: s, ms }
}

export function normalizeEvent(
  datasetId: DatasetId,
  row: Record<string, unknown>
): NormalizedEvent | null {
  switch (datasetId) {
    case '911-realtime':
    case '911-historical': {
      const t = parseTimestamp(row.received_datetime)
      if (!t) return null
      const c = coords(row)
      return {
        id: `${datasetId}:${row.cad_number ?? row.dispatch_id ?? row.id}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.analysis_neighborhood as string | undefined,
        longitude: c.lon,
        latitude: c.lat,
        callType: row.call_type_final_desc as string | undefined,
        headline: (row.call_type_final_desc as string | undefined) ?? '911 dispatch',
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
        longitude: c.lon,
        latitude: c.lat,
        callType: row.service_subtype as string | undefined,
        headline: (row.service_subtype as string | undefined) ?? (row.service_name as string | undefined) ?? '311 case',
        raw: row,
      }
    }

    case 'parking-revenue': {
      const t = parseTimestamp(row.session_start_dt)
      if (!t) return null
      const c = coords(row)
      return {
        id: `parking-revenue:${row.post_id ?? row.session_id ?? `${row.session_start_dt}-${row.meter_id}`}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.analysis_neighborhood as string | undefined,
        longitude: c.lon,
        latitude: c.lat,
        callType: row.payment_type as string | undefined,
        headline: row.street_name ? `Meter @ ${row.street_name}` : 'Parking session',
        raw: row,
      }
    }

    case 'police-incidents': {
      const t = parseTimestamp(row.incident_datetime)
      if (!t) return null
      const c = coords(row)
      return {
        id: `police-incidents:${row.incident_id ?? row.incident_number}`,
        datasetId,
        timestamp: t.iso,
        receivedAt: t.ms,
        neighborhood: row.analysis_neighborhood as string | undefined,
        longitude: c.lon,
        latitude: c.lat,
        callType: row.incident_category as string | undefined,
        headline: (row.incident_subcategory as string | undefined) ?? (row.incident_category as string | undefined) ?? 'Police incident',
        raw: row,
      }
    }
  }
}
