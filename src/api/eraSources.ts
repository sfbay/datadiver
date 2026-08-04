// src/api/eraSources.ts
// Which dataset backs each view's Era Track, over what domain, with what
// structural discontinuities. Keyed by ViewId, which for every registered view
// is the route path minus its leading slash ('/crime-incidents' →
// 'crime-incidents'). NOTE: this is NOT CardTray's `viewId` prop, which is a
// camelCase localStorage key and unrelated.

import type { DatasetKey } from './datasets'
import type { ViewId } from '@/types/datasets'
import type { CityId } from '@/cities/routing'

export interface EraSeam {
  year: number
  /** Reader-facing. Rendered beside a dashed rule on the strip. */
  label: string
}

export interface EraSource {
  datasetKey: DatasetKey
  dateField: string
  /** Inclusive year bounds; null upper = open to today. Guards published-range
   *  junk — this is load-bearing, not cosmetic (see parking-citations). */
  clamp: [number, number | null]
  /** Set when the clamp HIDES published rows. Rendered on the axis, because a
   *  silently narrowed domain is the same class of dishonesty as a silently
   *  dropped row. Omit when the clamp merely matches the real data floor. */
  clampNote?: string
  /** A second, older extract covering the years BELOW `untilYear`. SFPD is the
   *  only such case: wg3w-h783 starts 2018 and tmnf-yvry covers 2003–2017, so
   *  a single query against the modern set would leave the strip's pre-2018
   *  half empty while the domain claimed to reach 2003.
   *  `untilYear` is EXCLUSIVE and doubles as the modern query's lower bound,
   *  which is what stops the 4.5-month overlap between the two extracts from
   *  being counted twice (see src/views/CrimeIncidents/crimeEra.ts). */
  historical?: { datasetKey: DatasetKey; dateField: string; untilYear: number }
  seams?: EraSeam[]
}

export const ERA_SOURCES: Partial<Record<ViewId, EraSource>> = {
  'crime-incidents': {
    datasetKey: 'policeIncidents',
    dateField: 'incident_datetime',
    clamp: [2003, null],
    // 2003–2017 lives in a separate extract with a different schema. untilYear
    // 2018 is also the modern query's lower bound, so the 4.5-month overlap
    // between the two datasets is never double-counted.
    historical: {
      datasetKey: 'policeIncidentsHistorical',
      dateField: 'date',
      untilYear: 2018,
    },
    // A definitional discontinuity, not a data gap: same city, same phenomenon,
    // different counting system. An unmarked continuous run would imply the
    // two eras are like-for-like.
    seams: [{ year: 2018, label: 'SFPD changed its category system' }],
  },
  'emergency-response': {
    datasetKey: 'fireEMSDispatch',
    dateField: 'received_dttm',
    clamp: [2000, null],
  },
  '311-cases': {
    datasetKey: 'cases311',
    dateField: 'requested_datetime',
    clamp: [2008, null],
  },
  'traffic-safety': {
    datasetKey: 'trafficCrashes',
    dateField: 'collision_datetime',
    clamp: [2005, null],
  },
  // Published range is 1951-01-21 → 2044-12-21; BOTH ends are data-entry junk.
  // The only registered source whose clamp hides published rows — hence the note.
  'parking-citations': {
    datasetKey: 'parkingCitations',
    dateField: 'citation_issued_datetime',
    clamp: [2012, 2026],
    clampNote: 'range clamped — published dates run to 2044',
  },
  'parking-revenue': {
    datasetKey: 'parkingRevenue',
    dateField: 'session_start_dt',
    clamp: [2017, null],
  },
  housing: {
    datasetKey: 'evictionNotices',
    dateField: 'file_date',
    clamp: [1997, null],
  },
}

/** Registered source for a (city, view) identity, or undefined.
 *  Undefined remains the correct answer for unregistered ViewId routes and for
 *  everything outside the union (/live especially — useUrlSync strips
 *  start/end there). Oakland returns undefined for every view until stage 2
 *  introduces its own era table with its own researched clamps and seams —
 *  none of SF's transfer. */
export function eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined {
  if (cityId !== 'sf') return undefined
  return ERA_SOURCES[viewId as ViewId]
}

export interface EraQuery {
  $select: string; $group: string; $where: string; $limit: number
}

/** The annual GROUP BY for the PRIMARY (modern) extract. ~24 rows; the caller
 *  caches it hard. When a `historical` extract exists its `untilYear` becomes
 *  this query's lower bound, so the two never overlap. */
export function buildEraQuery(src: EraSource): EraQuery {
  const [lo, hi] = src.clamp
  const from = src.historical ? src.historical.untilYear : lo
  const where = [`${src.dateField} >= '${from}-01-01'`]
  if (hi != null) where.push(`${src.dateField} < '${hi + 1}-01-01'`)
  return {
    $select: `date_extract_y(${src.dateField}) as yr, count(*) as n`,
    $group: 'yr',
    $where: where.join(' AND '),
    $limit: 60,
  }
}

/** The same GROUP BY against the older extract, covering the clamp floor up to
 *  (not including) `untilYear`. Null when the source has no second extract. */
export function buildHistoricalEraQuery(src: EraSource): EraQuery | null {
  if (!src.historical) return null
  const { dateField, untilYear } = src.historical
  return {
    $select: `date_extract_y(${dateField}) as yr, count(*) as n`,
    $group: 'yr',
    $where: `${dateField} >= '${src.clamp[0]}-01-01' AND ${dateField} < '${untilYear}-01-01'`,
    $limit: 60,
  }
}

/** Selectable domain: the clamp floor to today, or to the clamp ceiling's end
 *  of year when it is earlier than today. */
export function eraDomain(src: EraSource, today: string): { start: string; end: string } {
  const [lo, hi] = src.clamp
  const ceiling = hi != null ? `${hi}-12-31` : today
  return { start: `${lo}-01-01`, end: ceiling < today ? ceiling : today }
}
