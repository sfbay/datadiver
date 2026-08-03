// src/views/CrimeIncidents/crimeEra.ts
//
// SFPD publishes its incident history as TWO datasets with different schemas,
// different category vocabularies, and a 4.5-month OVERLAP:
//
//   tmnf-yvry  "Historical 2003 to May 2018"   2,071,736 rows, ends 2018-05-15
//   wg3w-h783  "2018 to Present"               1,050,739 rows, starts 2018-01-01
//
// This module is the pure seam between them. Nothing here fetches; the view
// asks for a plan, then runs whichever queries the plan says it needs.
//
// THE OVERLAP IS THE TRAP. Both datasets carry Jan 1 – May 15 2018 (43,733 vs
// 54,326 rows, same 18xxxxxxx incident numbers), so a naive UNION inflates
// that window by ~80%. The seam is cut at CRIME_ERA_SEAM and the CURRENT
// dataset owns the overlap — it is the more complete of the two there
// (it includes online/Coplogic report types the historical extract omits).
//
// The two vocabularies are NOT reconciled. SFPD's pre-2018 categories
// ('LARCENY/THEFT', 'OTHER OFFENSES', 'NON-CRIMINAL') have no faithful mapping
// onto today's ('Larceny Theft', 'Other Miscellaneous', 'Malicious Mischief'),
// and inventing one would make the view claim a continuity the data does not
// have. Categories are shown AS PUBLISHED per era, and the category FILTER —
// whose violent/property/quality-of-life groups are built on the modern names
// — is disabled whenever historical rows are in range rather than silently
// matching nothing.

/** First day the modern dataset (wg3w-h783) owns. Historical is queried
 *  strictly BELOW this; current strictly at-or-above. */
export const CRIME_ERA_SEAM = '2018-01-01'

/** Real floor of tmnf-yvry. Ranges below this return nothing, not an error. */
export const CRIME_HISTORY_MIN = '2003-01-01'

export type CrimeEra = 'current' | 'historical' | 'straddle'

export interface DateRange {
  start: string // 'YYYY-MM-DD'
  end: string   // 'YYYY-MM-DD'
}

export interface CrimeEraPlan {
  era: CrimeEra
  /** Sub-range each source must be asked for, seam-cut. null = don't query. */
  currentRange: DateRange | null
  historicalRange: DateRange | null
  /** The modern category vocabulary can't filter historical rows — see above. */
  categoryFilterAvailable: boolean
  /** cad_number (the 911 cross-reference) exists only in the modern dataset. */
  cadLinkAvailable: boolean
}

/** Which source(s) cover this range, and over exactly which days.
 *  Pure string comparison — 'YYYY-MM-DD' sorts chronologically, so no Date
 *  parsing (and no host-timezone dependence) is involved. */
export function planCrimeEra(range: DateRange): CrimeEraPlan {
  const needsHistorical = range.start < CRIME_ERA_SEAM
  const needsCurrent = range.end >= CRIME_ERA_SEAM

  const historicalRange = needsHistorical
    ? {
        start: range.start < CRIME_HISTORY_MIN ? CRIME_HISTORY_MIN : range.start,
        // Historical stops the day before the seam; the modern set owns the rest.
        end: range.end < CRIME_ERA_SEAM ? range.end : dayBefore(CRIME_ERA_SEAM),
      }
    : null

  const currentRange = needsCurrent
    ? { start: range.start >= CRIME_ERA_SEAM ? range.start : CRIME_ERA_SEAM, end: range.end }
    : null

  const era: CrimeEra =
    needsHistorical && needsCurrent ? 'straddle' : needsHistorical ? 'historical' : 'current'

  return {
    era,
    currentRange,
    historicalRange,
    categoryFilterAvailable: !needsHistorical,
    cadLinkAvailable: !needsHistorical,
  }
}

/** 'YYYY-MM-DD' minus one day, by calendar arithmetic on UTC midnight
 *  (a bare date parses as UTC per spec, so this is viewer-timezone-proof). */
export function dayBefore(iso: string): string {
  const ms = Date.parse(iso.slice(0, 10)) - 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

// ── Historical field names ──────────────────────────────────────────────────
// tmnf-yvry names nothing the way wg3w-h783 does. Kept in one place so a
// query builder can never half-translate a clause.
export const HISTORICAL_FIELDS = {
  /** calendar_date, DATE ONLY — the clock lives in `time` as text. */
  date: 'date',
  /** text 'HH:MM', zero-padded (verified min '00:01' / max '23:59'), so
   *  lexicographic comparison IS a valid hour filter. date_extract_hh cannot
   *  be used: there is no timestamp column to extract from. */
  time: 'time',
  category: 'category',
  description: 'descript',
  resolution: 'resolution',
  district: 'pddistrict',
  address: 'address',
  incidentNumber: 'incidntnum',
  id: 'pdid',
  /** Analysis Neighborhoods arrive as a computed-region ID, not a name —
   *  translate with HISTORICAL_NEIGHBORHOOD_BY_REGION_ID. Populated on
   *  2,070,733 of 2,071,736 rows (99.95%). */
  neighborhoodRegion: ':@computed_region_ajp5_b2md',
} as const

/** The `$select` a historical row query needs to normalize cleanly. */
export const HISTORICAL_SELECT_FIELDS = [
  HISTORICAL_FIELDS.id,
  HISTORICAL_FIELDS.incidentNumber,
  HISTORICAL_FIELDS.date,
  HISTORICAL_FIELDS.time,
  HISTORICAL_FIELDS.category,
  HISTORICAL_FIELDS.description,
  HISTORICAL_FIELDS.resolution,
  HISTORICAL_FIELDS.address,
  HISTORICAL_FIELDS.district,
  'x',
  'y',
  `${HISTORICAL_FIELDS.neighborhoodRegion} as region_id`,
].join(',')

/** Region ID → Analysis Neighborhood name, from ajp5-b2md ("Neighborhoods -
 *  Analysis Boundaries"). All 41 names match the vocabulary the rest of the
 *  app uses, so historical rows rank against modern ones without a crosswalk. */
export const HISTORICAL_NEIGHBORHOOD_BY_REGION_ID: Record<string, string> = {
  '1': 'Bayview Hunters Point',
  '2': 'Bernal Heights',
  '3': 'Haight Ashbury',
  '4': 'Mission Bay',
  '5': 'Castro/Upper Market',
  '6': 'Chinatown',
  '7': 'Excelsior',
  '8': 'Financial District',
  '9': 'Hayes Valley',
  '10': 'Glen Park',
  '11': 'Inner Richmond',
  '12': 'Golden Gate Park',
  '13': 'Marina',
  '14': 'Inner Sunset',
  '15': 'Japantown',
  '16': 'Lakeshore',
  '17': 'Lincoln Park',
  '18': 'Lone Mountain/USF',
  '19': 'McLaren Park',
  '20': 'Mission',
  '21': 'Nob Hill',
  '22': 'Noe Valley',
  '23': 'North Beach',
  '24': 'Oceanview/Merced/Ingleside',
  '25': 'Portola',
  '26': 'Potrero Hill',
  '27': 'Presidio',
  '28': 'Outer Mission',
  '29': 'Outer Richmond',
  '30': 'Pacific Heights',
  '31': 'Presidio Heights',
  '32': 'Russian Hill',
  '33': 'Seacliff',
  '34': 'South of Market',
  '35': 'Sunset/Parkside',
  '36': 'Tenderloin',
  '37': 'Treasure Island',
  '38': 'Twin Peaks',
  '39': 'Western Addition',
  '40': 'Visitacion Valley',
  '41': 'West of Twin Peaks',
}

/** Raw historical row as selected by HISTORICAL_SELECT_FIELDS. */
export interface HistoricalIncidentRow {
  pdid?: string
  incidntnum?: string
  date?: string
  time?: string
  category?: string
  descript?: string
  resolution?: string
  address?: string
  pddistrict?: string
  x?: string
  y?: string
  region_id?: string
}

/** A historical row in the modern view's shape. Fields the historical extract
 *  genuinely lacks are left EMPTY rather than faked: cad_number (no 911
 *  cross-reference existed), incident_subcategory, intersection. */
export interface NormalizedIncident {
  incident_id: string
  incident_number: string
  cad_number: string
  incident_datetime: string
  report_datetime: string
  incident_category: string
  incident_subcategory: string
  incident_description: string
  resolution: string
  intersection: string
  analysis_neighborhood: string
  police_district: string
  latitude: number | null
  longitude: number | null
  /** Marks the row as pre-2018 so the UI can disclose the seam per row. */
  isHistorical: true
}

/** Historical row → modern shape. `date` is date-only and `time` is 'HH:MM'
 *  text, so the timestamp is reassembled as a FLOATING SF-local string —
 *  the same no-offset convention DataSF uses everywhere and the one
 *  parseSfLocal expects. Never build it via Date/toISOString. */
export function normalizeHistoricalIncident(
  row: HistoricalIncidentRow,
): NormalizedIncident | null {
  const day = row.date?.slice(0, 10)
  if (!day) return null
  const clock = /^\d{2}:\d{2}$/.test(row.time ?? '') ? (row.time as string) : '00:00'
  const lat = row.y != null ? Number(row.y) : NaN
  const lng = row.x != null ? Number(row.x) : NaN
  // Unlocatable historical rows are published at latitude 90 — measured at
  // exactly 138 rows, and the SF-bbox count is the total minus those 138, so
  // this single check is the whole geo cleanup. (Separately, ~53K rows sit on
  // the Hall of Justice at 850 Bryant: reports filed at the station rather
  // than located. Those are real incidents and are NOT dropped.)
  const geoOk = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 90 && Math.abs(lat) <= 90

  return {
    incident_id: row.pdid ?? '',
    incident_number: row.incidntnum ?? '',
    cad_number: '',
    incident_datetime: `${day}T${clock}:00`,
    report_datetime: '',
    incident_category: row.category ?? '',
    incident_subcategory: '',
    incident_description: row.descript ?? '',
    resolution: row.resolution ?? '',
    intersection: row.address ?? '',
    analysis_neighborhood:
      (row.region_id != null ? HISTORICAL_NEIGHBORHOOD_BY_REGION_ID[row.region_id] : undefined) ?? '',
    police_district: titleCaseDistrict(row.pddistrict ?? ''),
    latitude: geoOk ? lat : null,
    longitude: geoOk ? lng : null,
    isHistorical: true,
  }
}

/** 'TARAVAL' → 'Taraval', matching the modern police_district casing so the
 *  two eras group together instead of appearing as separate districts. */
export function titleCaseDistrict(d: string): string {
  if (!d) return ''
  return d
    .toLowerCase()
    .split(/(\s+|\/)/)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}

/** Historical hour filter using the zero-padded `time` TEXT column.
 *  Returns null when no filter applies. Wrapping windows (e.g. 22→3) become
 *  an OR, exactly as the modern date_extract_hh clause does. */
export function historicalHourClause(
  startHour: number,
  endHour: number,
): string | null {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return null
  const lo = `${String(startHour).padStart(2, '0')}:00`
  const hi = `${String(endHour).padStart(2, '0')}:59`
  const t = HISTORICAL_FIELDS.time
  if (startHour <= endHour) return `${t} >= '${lo}' AND ${t} <= '${hi}'`
  return `(${t} >= '${lo}' OR ${t} <= '${hi}')`
}

/** Merge two GROUP BY result sets that share a label, summing counts.
 *  Used for the category / neighborhood / resolution rails across a straddle,
 *  where the same neighborhood legitimately appears in both eras. */
export function mergeAggRows<K extends string, C extends string>(
  a: Array<Record<string, string>>,
  b: Array<Record<string, string>>,
  labelKey: K,
  countKey: C,
): Array<Record<string, string>> {
  const totals = new Map<string, number>()
  for (const row of [...a, ...b]) {
    const label = row[labelKey]
    if (label == null || label === '') continue
    totals.set(label, (totals.get(label) ?? 0) + (parseInt(row[countKey], 10) || 0))
  }
  return [...totals.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([label, count]) => ({ [labelKey]: label, [countKey]: String(count) }))
}
