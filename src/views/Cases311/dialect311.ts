// src/views/Cases311/dialect311.ts
//
// The per-city 311 dialect (stage-3 spec §4). quth-gb8e traps handled here:
// coded reqcategory tokens (no display-name column exists — the label map is
// AUTHORED, pinned by test), an 11-value ALL-CAPS status vocabulary with no
// SF-style 'Open' (the open-work set is authored grammar, disclosed on the
// card), srx/sry as the ONLY trustworthy coordinates (reqaddress is a
// constant junk ocean point — never read it), and a bbox validity filter
// because parseFloat would happily accept junk as "valid".

export const OAK311_SELECT =
  'requestid,datetimeinit,datetimeclosed,status,reqcategory,description,beat,srx,sry,probaddress,reqaddress_address,source,referredto'

export const EYEBROWS_311 = {
  sf: 'SF311 · Civic Complaint Analysis',
  oakland: 'OAK 311 · Civic Complaint Analysis',
} as const

/** Authored reader labels for all 30 coded tokens (spec §4, test-pinned). */
export const OAK311_LABELS: Record<string, string> = {
  ILLDUMP: 'Illegal dumping', 'ABANDONED AUTO': 'Abandoned vehicles',
  'HOMELESS EMT': 'Homeless encampments', PARKING: 'Parking enforcement',
  OTHER: 'Other', BLDGMAINT: 'Building maintenance', STREETSW: 'Street sweeping',
  ELECTRICAL: 'Streetlights & electrical', GRAFFITI: 'Graffiti',
  METER_REPAIR: 'Parking meters', TREES: 'Trees', TRAFFIC: 'Traffic signs & signals',
  KOCB: 'Litter containers', RECYCLING: 'Recycling', PARKS: 'Parks',
  ROW_INSPECTORS: 'Right-of-way inspections', TRAFFIC_ENGIN: 'Traffic engineering',
  DRAINAGE: 'Drainage', SEWERS: 'Sewers', ROW_STREETSW: 'Right-of-way sweeping',
  CUT_CLEAN: 'Vegetation & lot cleanup', ENVIRON_ENF: 'Environmental enforcement',
  SIDESHOWS: 'Sideshows', FIRE: 'Fire hazards', WATERSHED: 'Watershed & creeks',
  HE_CLEAN: 'Encampment cleanup', POLICE: 'Police referrals',
  CW_DIT_GIS: 'City data & GIS', FACILITIES: 'City facilities', SURVEY: 'Surveys',
}

/** Display-only. Raw tokens ride WHERE clauses and ?categories=. */
export const displayCategory311 = (raw: string): string => OAK311_LABELS[raw] ?? raw

export const OAK311_GROUPS: Record<string, string[]> = {
  'Dumping & Blight': ['ILLDUMP', 'GRAFFITI', 'KOCB', 'CUT_CLEAN', 'ENVIRON_ENF', 'RECYCLING'],
  'Vehicles & Parking': ['ABANDONED AUTO', 'PARKING', 'METER_REPAIR', 'SIDESHOWS'],
  'Streets & Utilities': [
    'STREETSW', 'ROW_STREETSW', 'ELECTRICAL', 'TREES', 'TRAFFIC',
    'TRAFFIC_ENGIN', 'DRAINAGE', 'SEWERS', 'ROW_INSPECTORS', 'WATERSHED',
  ],
  Homelessness: ['HOMELESS EMT', 'HE_CLEAN'],
}

/** Authored open-work grammar (spec §4): OPEN + PENDING + WOCREATE (work
 *  order created = in progress) + WAITING ON CUSTOMER. CANCEL/REFERRED and
 *  the closed family are NOT open city work. Disclosed on the card subtitle;
 *  every client-side status read resolves through this set — including the
 *  detail panel's badge. */
export const OAK311_OPEN_STATUSES: ReadonlySet<string> =
  new Set(['OPEN', 'PENDING', 'WOCREATE', 'WAITING ON CUSTOMER'])
export const isOakCaseOpen = (status: string | undefined | null): boolean =>
  status != null && OAK311_OPEN_STATUSES.has(status)
export const OAK311_OPEN_CLAUSE =
  "status IN ('OPEN','PENDING','WOCREATE','WAITING ON CUSTOMER')"

/** Oakland's rough extent — the validity fence for srx/sry (99.978% of
 *  non-null coords fall inside; 62 outliers measured). */
export const OAKLAND_BBOX = { west: -122.36, east: -122.10, south: 37.70, north: 37.90 }

/** srx = longitude, sry = latitude — WGS84 degrees typed `number` in Socrata
 *  (serialized as strings over JSON). Bbox-validated: parseFloat alone would
 *  accept junk. */
export function oak311Coords(row: { srx?: string | number; sry?: string | number }): { lat: number; lng: number } | null {
  const lng = typeof row.srx === 'string' ? parseFloat(row.srx) : row.srx
  const lat = typeof row.sry === 'string' ? parseFloat(row.sry) : row.sry
  if (lng == null || lat == null || Number.isNaN(lng) || Number.isNaN(lat)) return null
  if (lng < OAKLAND_BBOX.west || lng > OAKLAND_BBOX.east) return null
  if (lat < OAKLAND_BBOX.south || lat > OAKLAND_BBOX.north) return null
  return { lat, lng }
}

/** The whole-24h-period + remainder resolution math, parameterized by field
 *  pair. SF's literal is reproduced byte-identically (test-pinned) — see the
 *  original comment in Cases311.tsx for why date_diff_d alone is wrong. */
export function resolutionHoursExpr(closedField: string, dateField: string): string {
  return (
    `(date_diff_d(${closedField}, ${dateField}) * 86400 + ` +
    `((date_extract_hh(${closedField}) - date_extract_hh(${dateField})) * 3600 + ` +
    `(date_extract_mm(${closedField}) - date_extract_mm(${dateField})) * 60 + ` +
    `(date_extract_ss(${closedField}) - date_extract_ss(${dateField})) + 86400) % 86400) / 3600`
  )
}

const esc = (s: string) => s.replace(/'/g, "''")

export interface Where311Opts {
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

function build311Where(dateField: string, areaField: string, opts: Where311Opts): string {
  const c: string[] = [
    `${dateField} >= '${opts.dateRange.start}T00:00:00'`,
    `${dateField} <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.categoryClause) c.push(opts.categoryClause)
  if (opts.selectedNeighborhood) c.push(`${areaField} = '${esc(opts.selectedNeighborhood)}'`)
  if (opts.timeOfDayFilter) c.push(hourClause(dateField, opts.timeOfDayFilter))
  return c.join(' AND ')
}

function build311DateOnly(dateField: string, opts: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>): string {
  const c: string[] = [
    `${dateField} >= '${opts.dateRange.start}T00:00:00'`,
    `${dateField} <= '${opts.dateRange.end}T23:59:59'`,
  ]
  if (opts.timeOfDayFilter) c.push(hourClause(dateField, opts.timeOfDayFilter))
  return c.join(' AND ')
}

/** SF strings byte-identical to the legacy inline construction (test-pinned —
 *  the comparison factory's string-replace fence). */
export const buildSf311Where = (o: Where311Opts) => build311Where('requested_datetime', 'analysis_neighborhood', o)
export const buildSf311DateOnly = (o: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>) => build311DateOnly('requested_datetime', o)
export const buildOak311Where = (o: Where311Opts) => build311Where('datetimeinit', 'beat', o)
export const buildOak311DateOnly = (o: Pick<Where311Opts, 'dateRange' | 'timeOfDayFilter'>) => build311DateOnly('datetimeinit', o)
