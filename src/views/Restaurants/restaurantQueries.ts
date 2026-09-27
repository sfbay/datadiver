// src/views/Restaurants/restaurantQueries.ts
//
// Pure builders for the view's five LIVE queries on tvy3-wexg (spec §3.3).
// Pure so the SoQL is pinned by test and the hook only schedules them.
//
// Two rules every builder obeys, both test-pinned:
//   1. THE TODAY CLAMP. Every $where carries `inspection_date <= '{sfToday}'`.
//      One junk row is dated 2031-05-16 (Cisco Systems, permit 105295); an
//      unclamped MAX() returns it as the data edge. That is also why Q5
//      replaces useDataFreshness here — its MAX(dateField) has no $where.
//   2. INSPECTORS ARE SHOWN, NEVER RANKED (Jesse, 2026-09-24, spec §11). Q4
//      selects `inspector` so the storefront biography can name who did each
//      inspection; no builder groups, orders or filters by it. Closure rates
//      by inspector track territory, not rigor (A §7) — a ranking would be a
//      false finding, so there is no query that could build one.
//
// `sfToday` is the SF-local date string ('YYYY-MM-DD') the hook derives from
// sfTime.ts — never toISOString(), which is UTC digits.

import type { SoQLParams } from '@/api/client'
import { FOOD_WHERE, STOREFRONT_WHERE } from './foodPermits'
import { clampedEnd, type FeedWindow } from './inspectionFeed'

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`

/** `inspection_date <= '{sfToday}'` — on every query. */
export function todayClamp(sfToday: string): string {
  return `inspection_date <= ${q(sfToday)}`
}

/** The window's date range, its end clamped to today, plus the today clamp. */
export function windowClause(w: Pick<FeedWindow, 'start' | 'end'>, sfToday: string): string {
  return `inspection_date BETWEEN ${q(w.start)} AND ${q(clampedEnd(w, sfToday))} AND ${todayClamp(sfToday)}`
}

const nhoodClause = (nhood: string | null | undefined): string =>
  nhood ? ` AND analysis_neighborhood = ${q(nhood)}` : ''

/** Q1/Q2's three figures. Unit = PLACES (distinct permits), never rows: a
 *  place closed at four reinspections counts once. */
export const CARD_SELECT =
  "count(distinct case(facility_rating_status='Closure', permit_number)) AS closed, " +
  "count(distinct case(facility_rating_status='Conditional Pass', permit_number)) AS yellow, " +
  'count(distinct permit_number) AS inspected'

/** Q1 · the three cards, citywide or for one neighborhood (the PositionScale
 *  value) — FOOD permits, mapped or not. One row. */
export function cardsQuery(w: FeedWindow, sfToday: string, nhood?: string | null): SoQLParams {
  return {
    $select: CARD_SELECT,
    $where: `${FOOD_WHERE} AND ${windowClause(w, sfToday)}${nhoodClause(nhood)}`,
    $limit: 1,
  }
}

/** Q2 · neighborhood rates: the same three figures per Analysis Neighborhood.
 *  The rate is closed ÷ inspected — the view never ranks raw counts. */
export function neighborhoodRatesQuery(w: FeedWindow, sfToday: string): SoQLParams {
  return {
    $select: `analysis_neighborhood, ${CARD_SELECT}`,
    $where: `${FOOD_WHERE} AND ${windowClause(w, sfToday)}`,
    $group: 'analysis_neighborhood',
    $order: 'analysis_neighborhood',
    $limit: 100,
  }
}

/** Q3a's cap. Measured 2026-09-24 under STOREFRONT_WHERE: 5,008 groups for
 *  `before`, 2,264 for `since` — well under, so a full page is a real
 *  truncation signal (hitLimit stays honest). */
export const MAP_PERMIT_LIMIT = 10_000

/** Q3a · the map: one row per STOREFRONT permit with a placard in the window. */
export function mapPermitsQuery(w: FeedWindow, sfToday: string): SoQLParams {
  return {
    $select:
      'permit_number, max(dba) AS dba, max(street_address_clean) AS addr, ' +
      'max(latitude) AS lat, max(longitude) AS lng, max(inspection_date) AS last_date',
    $where: `${STOREFRONT_WHERE} AND facility_rating_status IS NOT NULL AND ${windowClause(w, sfToday)}`,
    $group: 'permit_number',
    $order: 'permit_number',
    $limit: MAP_PERMIT_LIMIT,
  }
}

/** Q3b's cap. The whole dataset holds 468 Closure + 681 Conditional Pass rows
 *  across ALL time (probe 2026-09-24), so one window can never reach it. */
export const NON_PASS_LIMIT = 5_000

/** Q3b · every non-pass reading in the window. With Q3a it yields each
 *  permit's LATEST reading (the Q3b row on Q3a.last_date, else Pass) from
 *  complete data — no latest-reading math ever runs on a capped sample. */
export function nonPassReadingsQuery(w: FeedWindow, sfToday: string): SoQLParams {
  return {
    $select: 'permit_number, inspection_date, facility_rating_status',
    $where: `${STOREFRONT_WHERE} AND facility_rating_status IN ('Closure','Conditional Pass') AND ${windowClause(w, sfToday)}`,
    $order: 'permit_number, inspection_date',
    $limit: NON_PASS_LIMIT,
  }
}

/** Q4's cap — a storefront's permits carry dozens of rows, not hundreds. */
export const LANE_LIMIT = 1_000

/** Q4 · the selected storefront's 2024+ lane, every row, oldest first.
 *  Selects `inspector` — shown per inspection, never ranked (§11). */
export function storefrontLaneQuery(permits: readonly string[], sfToday: string): SoQLParams {
  const list = [...new Set(permits.filter(Boolean))]
  return {
    $select:
      'inspection_date, permit_number, permit_type, dba, inspection_type, ' +
      'facility_rating_status, violation_count, violation_codes, inspector',
    // An empty permit list must match nothing, never everything.
    $where: `${list.length ? `permit_number IN (${list.map(q).join(',')})` : '1 = 0'} AND ${todayClamp(sfToday)}`,
    $order: 'inspection_date, permit_number',
    $limit: LANE_LIMIT,
  }
}

/** Q5 · the data edge for the "Updated" chip — MAX(inspection_date) under the
 *  today clamp (2026-09-23 at probe; unclamped it reads 2031-05-16). */
export function dataEdgeQuery(sfToday: string): SoQLParams {
  return {
    $select: 'max(inspection_date) AS edge',
    $where: todayClamp(sfToday),
    $limit: 1,
  }
}
