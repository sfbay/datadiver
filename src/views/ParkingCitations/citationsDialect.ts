/**
 * Oakland dialect for the Parking Citations view (58em-y96b) — stage 3b.
 *
 * ZERO-IMPORT PURE LEAF (the dialect311 idiom): any hook/factory may import
 * from here without cycle risk. Spec:
 * docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md
 *
 * Data traps this module encodes (probe-verified 2026-08-06):
 * - The beat column is a Socrata computed region holding NUMBER ids, not
 *   beat codes. Crosswalk below; filter with an UNQUOTED numeric.
 * - `violatio_1` descriptions carry a 10-char truncation era (~2M rows) —
 *   group/filter on the clean `violation` CODE, label via the authored map.
 * - `ticket_i_1` mixes three time formats + 18,856 NULLs; the hour module
 *   is the only sanctioned reader.
 */

export const OAK_BEAT_REGION_FIELD = ':@computed_region_fus4_casw'

/** regionId → beat code. Regenerate:
 *  curl -s --get 'https://data.oaklandca.gov/resource/fus4-casw.json' \
 *    --data-urlencode '$select=_feature_id,name' \
 *    --data-urlencode '$limit=100' --data-urlencode '$order=_feature_id' */
export const OAK_CITATION_BEAT_REGIONS: Record<string, string> = {
  '1': '02Y', '2': '16Y', '3': '10Y', '4': '07X', '5': '26Y',
  '6': '18X', '7': '32X', '8': '31Y', '9': '24X', '10': '17X',
  '11': '18Y', '12': '04X', '13': '13Y', '14': '25Y', '15': '34X',
  '16': '22Y', '17': '10X', '18': '31X', '19': '26X', '20': '20X',
  '21': '08X', '22': '05Y', '23': '01X', '24': 'LKM1', '25': '25X',
  '26': '03Y', '27': '30Y', '28': '31Z', '29': '23X', '30': '16X',
  '31': '13Z', '32': '24Y', '33': '15X', '34': '14Y', '35': '19X',
  '36': '12Y', '37': '11X', '38': '21Y', '39': '27X', '40': 'PDT2',
  '41': '13X', '42': '14X', '43': '22X', '44': '02X', '45': '21X',
  '46': '05X', '47': '35X', '48': '09X', '49': '32Y', '50': '28X',
  '51': '27Y', '52': '35Y', '53': '06X', '54': '33X', '55': '03X',
  '56': '29X', '57': '30X', '58': '12X', '59': '17Y',
}

const BEAT_TO_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(OAK_CITATION_BEAT_REGIONS).map(([id, code]) => [code, id])
)

export function beatToRegionId(beat: string): string | null {
  return BEAT_TO_REGION[beat] ?? null
}

export function regionToBeat(id: string | number | null | undefined): string {
  if (id == null) return 'Unknown'
  return OAK_CITATION_BEAT_REGIONS[String(id)] ?? 'Unknown'
}

/** Authored reader-facing labels for the top-30 violation CODES (94.6% of
 *  rows). Seeds = the most frequent UNTRUNCATED (>= 11 char) description per
 *  code, hand-polished; evidence table in the stage-3b plan. */
export const OAK_VIOLATION_LABELS: Record<string, string> = {
  '10.28.240': 'No parking — certain hours',
  '10.36.030B': 'No parking receipt displayed',
  '10.36.050': 'Expired meter',
  '10.40.020A1': 'No parking — red zone',
  '10.44.120A': 'Residential parking permit zone',
  '22500.F': 'No parking — on sidewalk',
  '5204': 'Registration tab not attached',
  '10.28.250': 'No parking anytime',
  '10.28.190': 'Two-hour parking zone',
  '10.40.060': 'No parking — yellow zone',
  '22500.H': 'Double parking',
  '10.16.110': 'Failure to obey posted signs',
  '22514': 'Blocking a fire hydrant',
  '10.40.070': 'No parking — white zone',
  '21211.B': 'Obstructing a bike lane',
  '10.28.040A': 'Parked over 18 inches from curb',
  '10.36.100': 'Expired meter — off-street lot',
  '21113.A': 'Parking on public grounds',
  '5200': 'License plate missing',
  '22500.G': 'Obstructing construction traffic',
  '22500.B': 'No parking — in crosswalk',
  '22507.8A': 'Disabled parking space violation',
  '22500.E': 'No parking — blocking driveway',
  '10.36.020': 'Parked over the marked space/meter',
  '22658.A': 'Removal from private property',
  '10.40.020A4': 'No parking — green zone',
  '10.40.090E': 'No parking — bus stop',
  '10.40.030B': 'No parking — special zone',
  '4000A1': 'No valid registration',
  '22522': 'Blocking a disabled-access ramp',
}

/** Quick groups over CODES (>= 2 codes each; 22658.A is a deliberate
 *  singleton left ungrouped). */
export const OAK_VIOLATION_GROUPS: Record<string, string[]> = {
  'Sweeping/Time limits': ['10.28.240', '10.28.250', '10.28.190', '10.16.110'],
  'Meters': ['10.36.030B', '10.36.050', '10.36.100', '10.36.020'],
  'Zones': ['10.40.020A1', '10.44.120A', '10.40.060', '10.40.070', '10.40.020A4', '10.40.090E', '10.40.030B'],
  'Registration': ['5204', '5200', '4000A1'],
  'Safety/Obstruction': ['22500.F', '22500.H', '22514', '21211.B', '10.28.040A', '21113.A', '22500.G', '22500.B', '22507.8A', '22500.E', '22522'],
}

export function oakViolationLabel(
  code: string | null | undefined,
  rawDesc: string | null | undefined
): string {
  if (code && OAK_VIOLATION_LABELS[code]) return OAK_VIOLATION_LABELS[code]
  return rawDesc || 'Unknown'
}

export const OAK_CITATION_SELECT =
  'the_geom,ticket_num,fine_amount,ticket_iss,ticket_i_1,violation,violatio_1,location,:@computed_region_fus4_casw'

export interface OakCitationRecord {
  the_geom?: { type: string; coordinates: [number, number] } | null
  ticket_num: string
  fine_amount: string
  ticket_iss: string
  ticket_i_1?: string | null
  violation?: string | null
  violatio_1?: string | null
  location?: string | null
  ':@computed_region_fus4_casw'?: string | null
}

// ── Hour module ──────────────────────────────────────────────────
// ticket_i_1 mixes 'HH:MM' (1,723,581), 'H:MM' (926,629),
// 'H:MM:SS AM/PM' (71,323), NULL (18,856). One SoQL expression tags each
// row with a bucket from a CLOSED vocabulary; bucketToHour is the single
// mapping; bucketsForHours inverts it for WHERE clauses. AM/PM branches
// come FIRST — a '10:00:00 AM' row also matches the bare pattern.

export const OAK_HOUR_EXPR =
  "case(ticket_i_1 like '%AM', 'A' || substring(ticket_i_1, 1, 2), ticket_i_1 like '%PM', 'P' || substring(ticket_i_1, 1, 2), true, substring(ticket_i_1, 1, 2))"

/** The closed bucket vocabulary the expression can emit for parseable rows. */
export const OAK_HOUR_BUCKETS: readonly string[] = (() => {
  const out: string[] = []
  for (let h = 0; h <= 23; h++) out.push(String(h).padStart(2, '0')) // '00'–'23'
  for (let h = 0; h <= 9; h++) out.push(`${h}:`)                     // '0:'–'9:'
  for (const m of ['A', 'P'] as const) {
    for (let h = 1; h <= 12; h++) {
      out.push(`${m}${String(h).padStart(2, '0')}`)                  // 'A01'–'A12'
      if (h <= 9) out.push(`${m}${h}:`)                              // 'A1:'–'A9:'
    }
  }
  return out
})()

/**
 * Bucket → hour 0–23, or null for the residual.
 * `undefined` is a REAL input, not defensiveness: Socrata omits the aliased
 * field entirely for the NULL-time GROUP BY bucket, so the residual reaches
 * this function as a missing key. A string-only implementation throws on the
 * exact population the hardened residual design exists for.
 */
export function bucketToHour(bucket: string | undefined): number | null {
  if (bucket == null) return null
  let s = bucket
  let meridiem: 'A' | 'P' | null = null
  if (s.startsWith('A') || s.startsWith('P')) {
    meridiem = s[0] as 'A' | 'P'
    s = s.slice(1)
  }
  s = s.replace(':', '')
  if (!/^\d{1,2}$/.test(s)) return null
  const n = parseInt(s, 10)
  if (meridiem) {
    if (n < 1 || n > 12) return null
    if (meridiem === 'A') return n === 12 ? 0 : n
    return n === 12 ? 12 : n + 12
  }
  return n >= 0 && n <= 23 ? n : null
}

/** Inverse, derived by FILTERING the closed vocabulary through bucketToHour —
 *  one logic source, no dual mapping to drift. */
export function bucketsForHours(hours: readonly number[]): string[] {
  const want = new Set(hours)
  return OAK_HOUR_BUCKETS.filter((b) => {
    const h = bucketToHour(b)
    return h !== null && want.has(h)
  })
}

// ── SF WHERE builders — VERBATIM moves from ParkingCitations.tsx ─────
// Byte-pinned by citationsDialect.test.ts. Never edit these strings.

export function sfViolationClause(selected: ReadonlySet<string>): string {
  if (selected.size === 0) return ''
  const escaped = Array.from(selected).map((c) => `'${c.replace(/'/g, "''")}'`)
  return `violation_desc IN (${escaped.join(',')})`
}

export function sfTodFragment(
  tod: { startHour: number; endHour: number } | null
): string {
  if (!tod) return ''
  const { startHour, endHour } = tod
  if (startHour <= endHour) {
    return `date_extract_hh(citation_issued_datetime) >= ${startHour} AND date_extract_hh(citation_issued_datetime) <= ${endHour}`
  }
  return `(date_extract_hh(citation_issued_datetime) >= ${startHour} OR date_extract_hh(citation_issued_datetime) <= ${endHour})`
}

export interface SfCitationWhereArgs {
  dateRange: { start: string; end: string }
  violationClause: string
  selectedNeighborhood: string | null
  todFragment: string
}

export function sfStatsWhere(args: SfCitationWhereArgs): string {
  const { dateRange, violationClause, selectedNeighborhood, todFragment } = args
  const conditions: string[] = []
  conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
  conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
  if (violationClause) conditions.push(violationClause)
  if (selectedNeighborhood) {
    conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
  }
  if (todFragment) conditions.push(todFragment)
  return conditions.join(' AND ')
}

export function sfDateOnlyClause(
  dateRange: { start: string; end: string },
  todFragment: string
): string {
  const conditions: string[] = []
  conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
  conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
  if (todFragment) conditions.push(todFragment)
  return conditions.join(' AND ')
}

// ── Oakland WHERE builders ───────────────────────────────────────

export function oakViolationClause(selected: ReadonlySet<string>): string {
  if (selected.size === 0) return ''
  const escaped = Array.from(selected).map((c) => `'${c.replace(/'/g, "''")}'`)
  return `violation IN (${escaped.join(',')})`
}

export function oakTodClause(
  tod: { startHour: number; endHour: number } | null
): string {
  if (!tod) return ''
  const hours: number[] = []
  const { startHour, endHour } = tod
  if (startHour <= endHour) {
    for (let h = startHour; h <= endHour; h++) hours.push(h)
  } else {
    for (let h = startHour; h <= 23; h++) hours.push(h)
    for (let h = 0; h <= endHour; h++) hours.push(h)
  }
  const buckets = bucketsForHours(hours)
  return `(${OAK_HOUR_EXPR}) IN (${buckets.map((b) => `'${b}'`).join(',')})`
}

export interface OakCitationWhereArgs {
  dateRange: { start: string; end: string }
  violationClause: string
  /** Beat CODE ('07X') — the canonical selection identity everywhere.
   *  The regionId exists ONLY inside this builder. */
  selectedBeat: string | null
  todClause: string
}

export function oakStatsWhere(args: OakCitationWhereArgs): string {
  const { dateRange, violationClause, selectedBeat, todClause } = args
  const conditions: string[] = []
  // MUST open with this exact pair — the comparison factory swaps the date
  // window by literal string-replace on these two clauses.
  conditions.push(`ticket_iss >= '${dateRange.start}T00:00:00'`)
  conditions.push(`ticket_iss <= '${dateRange.end}T23:59:59'`)
  if (violationClause) conditions.push(violationClause)
  if (selectedBeat) {
    // Number-typed column: UNQUOTED numeric. Unknown beat → impossible
    // filter (-1), never a silently unfiltered query.
    const regionId = beatToRegionId(selectedBeat)
    conditions.push(`${OAK_BEAT_REGION_FIELD} = ${regionId ?? -1}`)
  }
  if (todClause) conditions.push(todClause)
  return conditions.join(' AND ')
}

export function oakDateOnlyClause(
  dateRange: { start: string; end: string },
  todClause: string
): string {
  const conditions: string[] = []
  conditions.push(`ticket_iss >= '${dateRange.start}T00:00:00'`)
  conditions.push(`ticket_iss <= '${dateRange.end}T23:59:59'`)
  if (todClause) conditions.push(todClause)
  return conditions.join(' AND ')
}
