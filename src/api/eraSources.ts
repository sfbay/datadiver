// src/api/eraSources.ts
// Era Track query builders + the (city, view) → EraSource lookup. The source
// DATA lives on each city's view manifest (src/cities/sf/manifest.ts) — this
// module owns only the SoQL derivation. viewId here is the route-derived
// kebab identity (parseRoute), NOT CardTray's `viewId` prop, which is a
// camelCase localStorage key and unrelated.

import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import type { EraSource } from '@/cities/manifest'

// Type home moved to the manifest leaf in stage 1b; re-exported so consumers
// (useEraSeries, EraTrack) keep importing from the api layer.
export type { EraSeam, EraSource } from '@/cities/manifest'

/** Registered source for a (city, view) identity, or undefined.
 *  Undefined remains the correct answer for every unregistered view (/live
 *  especially — useUrlSync strips start/end there) and for every Oakland view
 *  until stage 2 authors its manifest entries with their own researched
 *  clamps and seams — none of SF's transfer. */
export function eraSourceFor(cityId: CityId, viewId: string): EraSource | undefined {
  return getCity(cityId).manifest.find((e) => e.viewId === viewId)?.eraSource
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
    $select: `date_extract_y(${src.dateField}) as yr, ${src.countExpr ?? 'count(*)'} as n`,
    $group: 'yr',
    $where: where.join(' AND '),
    $limit: 60,
  }
}

/** The same GROUP BY against the older extract, covering the clamp floor up to
 *  (not including) `untilYear`. Null when the source has no second extract. */
export function buildHistoricalEraQuery(src: EraSource): EraQuery | null {
  if (!src.historical) return null
  const { dateField, untilYear, countExpr } = src.historical
  // NOT `src.countExpr` — the two extracts name their case column differently.
  return {
    $select: `date_extract_y(${dateField}) as yr, ${countExpr ?? 'count(*)'} as n`,
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
