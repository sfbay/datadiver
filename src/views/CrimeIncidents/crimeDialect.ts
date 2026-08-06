// src/views/CrimeIncidents/crimeDialect.ts
//
// The per-city crime dialect (stage-3 spec §3). Oakland's ppgh-7dqv is ONE
// extract with a 10-column schema; SF's dual-extract machinery stays in
// crimeEra.ts and never runs for Oakland. Everything here is pure and
// node-tested. Three honesty rules live here:
//   1. casenumber is CHARGE-level (~15.5% duplicate rows) — every count is
//      count(distinct casenumber) and row consumers dedupe client-side.
//   2. The query floor makes pre-2004 ranges return absence, not the
//      ~1,400-row 1950→2003 junk trickle rendered as incidents.
//   3. Raw ALL-CAPS crimetype values ride data/URLs/WHERE clauses; display
//      sites title-case via titleCaseCrimetype.

import { extractCoordinates } from '@/utils/geo'

export const OAKLAND_CRIME_QUERY_FLOOR = '2004-01-01'
export const OAKLAND_CRIME_COUNT = 'count(distinct casenumber)'
export const OAKLAND_CRIME_SELECT =
  'casenumber,datetime,crimetype,description,policebeat,address,location'

export const CRIME_EYEBROWS = {
  sf: 'SFPD · Incident Reports & 911 Cross-Ref',
  oakland: 'OPD · Incident Reports',
} as const

/** Authored quick groups over the probe-pinned vocabulary (scope call 3:
 *  three groups; the administrative tail stays listed but ungrouped).
 *  THREATS→Violent and VANDALISM→Property are the two judgment calls,
 *  made once in the spec and pinned by test. */
export const OAKLAND_CRIME_GROUPS: Record<string, string[]> = {
  Violent: [
    'MISDEMEANOR ASSAULT', 'DOMESTIC VIOLENCE', 'ROBBERY', 'FELONY ASSAULT',
    'HOMICIDE', 'FORCIBLE RAPE', 'KIDNAPPING', 'BRANDISHING', 'CHILD ABUSE', 'THREATS',
  ],
  Property: [
    'STOLEN VEHICLE', 'BURG - AUTO', 'BURG - RESIDENTIAL', 'BURG - COMMERCIAL',
    'BURG - OTHER', 'PETTY THEFT', 'GRAND THEFT', 'VANDALISM',
    'FORGERY & COUNTERFEITING', 'FRAUD', 'EMBEZZLEMENT', 'ARSON',
    'POSSESSION - STOLEN PROPERTY',
  ],
  'Quality of Life': [
    'NARCOTICS', 'DISORDERLY CONDUCT', 'CURFEW & LOITERING', 'PROSTITUTION', 'DUI',
  ],
}

const CAPS_KEPT = new Set(['DUI', 'O/S'])

/** 'STOLEN VEHICLE' → 'Stolen Vehicle'; acronyms stay upper. Display-only —
 *  raw values ride WHERE clauses and ?categories=. */
export function titleCaseCrimetype(raw: string): string {
  if (!raw) return raw
  return raw
    .split(' ')
    .map((w) => (CAPS_KEPT.has(w) || !/^[A-Z]/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Raw ppgh-7dqv row (one per CHARGE). */
export interface OaklandCrimeRow {
  casenumber?: string
  datetime?: string
  crimetype?: string
  description?: string
  policebeat?: string
  address?: string
  location?: { type: string; coordinates: [number, number] } | null
}

/** Oakland charge row → the modern view shape (same normalization precedent
 *  as normalizeHistoricalIncident: fields the schema genuinely lacks stay
 *  EMPTY, never faked — cad_number, resolution, subcategory, report time.
 *  The UI withholds every surface that would read them (spec §3).
 *  `casenumber` rides along for client-side dedupe + the comparison hook. */
export interface AdaptedOaklandIncident {
  incident_id: string
  incident_number: string
  casenumber: string
  cad_number: ''
  incident_datetime: string
  report_datetime: ''
  incident_category: string
  incident_subcategory: ''
  incident_description: string
  resolution: ''
  intersection: string
  analysis_neighborhood: string
  police_district: ''
  latitude: number | null
  longitude: number | null
}

export function adaptOaklandIncident(row: OaklandCrimeRow): AdaptedOaklandIncident | null {
  if (!row.datetime) return null
  const coords = extractCoordinates(row.location ?? null)
  return {
    incident_id: row.casenumber ?? '',
    incident_number: row.casenumber ?? '',
    casenumber: row.casenumber ?? '',
    cad_number: '',
    incident_datetime: row.datetime,
    report_datetime: '',
    incident_category: row.crimetype ?? '',
    incident_subcategory: '',
    incident_description: row.description ?? '',
    resolution: '',
    intersection: row.address ?? '',
    analysis_neighborhood: row.policebeat ?? '',
    police_district: '',
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  }
}

const esc = (s: string) => s.replace(/'/g, "''")

export interface CrimeWhereOpts {
  dateRange: { start: string; end: string }
  categoryClause: string
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}

function hourClause(dateField: string, tod: { startHour: number; endHour: number }): string {
  const { startHour, endHour } = tod
  return startHour <= endHour
    ? `date_extract_hh(${dateField}) >= ${startHour} AND date_extract_hh(${dateField}) <= ${endHour}`
    : `(date_extract_hh(${dateField}) >= ${startHour} OR date_extract_hh(${dateField}) <= ${endHour})`
}

/** SF modern WHERE — moved VERBATIM from useCrimeEraData so the emitted
 *  string is byte-identical (the comparison factory's string-replace fence
 *  pins it). `range` is the plan's currentRange, not the raw dateRange. */
export function buildSfCrimeWhere(
  opts: CrimeWhereOpts & { categoryFilterAvailable?: boolean }
): string {
  const r = opts.dateRange
  const c: string[] = [
    `incident_datetime >= '${r.start}T00:00:00'`,
    `incident_datetime <= '${r.end}T23:59:59'`,
  ]
  if (opts.categoryClause && (opts.categoryFilterAvailable ?? true)) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`analysis_neighborhood = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause('incident_datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

export function buildSfCrimeDateOnly(opts: Pick<CrimeWhereOpts, 'dateRange' | 'timeOfDayFilter'>): string {
  const r = opts.dateRange
  const c: string[] = [
    `incident_datetime >= '${r.start}T00:00:00'`,
    `incident_datetime <= '${r.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause('incident_datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

/** Oakland WHERE. The query floor clamps the lower bound (junk trickle →
 *  absence); everything else mirrors the SF shape with Oakland field names,
 *  including the replace-compatible leading clause. */
export function buildOaklandCrimeWhere(opts: CrimeWhereOpts): string {
  const start = opts.dateRange.start < OAKLAND_CRIME_QUERY_FLOOR
    ? OAKLAND_CRIME_QUERY_FLOOR
    : opts.dateRange.start
  const c: string[] = [
    `datetime >= '${start}T00:00:00'`,
    `datetime <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.categoryClause) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`policebeat = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause('datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}

export function buildOaklandCrimeDateOnly(opts: Pick<CrimeWhereOpts, 'dateRange' | 'timeOfDayFilter'>): string {
  const start = opts.dateRange.start < OAKLAND_CRIME_QUERY_FLOOR
    ? OAKLAND_CRIME_QUERY_FLOOR
    : opts.dateRange.start
  const c: string[] = [
    `datetime >= '${start}T00:00:00'`,
    `datetime <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause('datetime', opts.timeOfDayFilter))
  return c.join(' AND ')
}
