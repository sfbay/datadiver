// src/views/Restaurants/useRestaurantData.ts
//
// The view's LIVE reads on tvy3-wexg (spec §3.3, D4): the three cards (Q1,
// citywide; a `?nh=` neighborhood reads its own Q2 row), neighborhood rates (Q2),
// the map's latest readings (Q3a + Q3b), the selected storefront's 2024+
// lane (Q4), the data edge for the "Updated" chip (Q5), and the window's
// "Every closure, newest first" list (§11: single closures ARE listed, each
// with its outcome). Everything that joins eras or the registry comes from
// the snapshot instead (useStorefronts.ts).
//
// Load-bearing rules:
//   · Every query carries the TODAY clamp (restaurantQueries.ts) — one junk
//     row is dated 2031-05-16. Q5 replaces useDataFreshness, whose MAX() has
//     no $where and returns that row.
//   · Staggered cold load (memory: six concurrent Socrata requests ran ~7×
//     slower) and `timeoutMs: 20_000, retries: 1` on every query.
//   · Dataset key is the string literal 'restaurantInspections' at every
//     call site — sources.test.ts's scanner reads literals only.
//   · Inspectors are SHOWN per inspection (Q4 selects the column) and never
//     grouped, ordered or filtered by (spec §11).

import { useEffect, useMemo, useState } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { sfLocalCutoff } from '@/utils/sfTime'
import { storefrontKey } from '@/lib/storefronts/storefrontKey'
import { isVenue } from '@/lib/storefronts/venues'
import { FOOD_WHERE, unclassifiedPermitTypes } from './foodPermits'
import { clampedEnd, feedWindow, type FeedWindow, type FeedWindowId } from './inspectionFeed'
import { closureEpisodes, type ClosureEpisode } from './closureEpisodes'
import {
  cardsQuery, neighborhoodRatesQuery, mapPermitsQuery, nonPassReadingsQuery,
  storefrontLaneQuery, dataEdgeQuery, windowClause, todayClamp,
} from './restaurantQueries'
import { latestReadings, displayAddress, displayName, inSf, type MapPermitRow, type NonPassRow, type ClosureMapPoint } from './mapLayers'

const VIEW = 'restaurants' as const
const SLOW = { timeoutMs: 20_000, retries: 1 } as const

// ── public types ────────────────────────────────────────────────────────────

/** Q1's three figures. Unit = PLACES (distinct permits), never rows. */
export interface CardFigures {
  closed: number
  yellow: number
  inspected: number
}

/** Below this many places inspected, a neighborhood is "too few inspected to rate". */
export const MIN_RATED = 50

export interface NeighborhoodRate extends CardFigures {
  /** Analysis Neighborhood; '' for the group of places DPH left unplaced — it
   *  is kept (never rated or listed) so a sum over rows is the citywide count. */
  nhood: string
  /** closed ÷ inspected; null when fewer than MIN_RATED places were inspected
   *  (or for the unplaced group). */
  closedShare: number | null
  yellowShare: number | null
}

/** One live map point (a STOREFRONT permit with a placard in the window).
 *  `key` is filled by the view from the snapshot (permit → door); the hook
 *  carries `addressKey` for doors the snapshot does not hold. */
export type MapReading = Omit<ClosureMapPoint, 'key'> & { addressKey: string }

/** One row of "Every closure, newest first": the episode (its `key` is the
 *  permit number) plus what the live rows say about the place. */
export interface ClosureListItem extends ClosureEpisode {
  permit: string
  name: string
  address: string
  /** storefrontKey(address) — the fallback when the permit is not in the snapshot. */
  addressKey: string
  nhood: string | null
}

/** A Q4 row — the selected storefront's 2024+ inspections, oldest first. */
export interface InspectionRow {
  inspection_date: string
  permit_number: string
  permit_type?: string
  dba?: string
  /** 100% null after the July 2025 feed change. */
  inspection_type?: string
  facility_rating_status?: string
  /** Violations RECORDED — never a severity (no major/minor flag exists). */
  violation_count?: string
  violation_codes?: string
  /** Shown per inspection; never ranked, filtered or searched (§11). */
  inspector?: string
}

export interface RestaurantDataOptions {
  window: FeedWindowId
  placard: 'closure' | 'conditional' | null
  nh: string | null
  /** The selected storefront's 2024+ permits (empty = no lane query). */
  atPermits: string[]
}

export interface RestaurantData {
  window: FeedWindow
  sfToday: string
  cards: { citywide: CardFigures | null; nhood: CardFigures | null }
  cardsLoading: boolean
  neighborhoodRates: NeighborhoodRate[]
  ratesLoading: boolean
  /** Latest readings, filtered by `placard` (the "closed"/"yellow" card filter). */
  mapReadings: MapReading[]
  mapLoading: boolean
  /** Q3a filled its page — the map is a sample, say so. */
  mapTruncated: boolean
  closuresList: ClosureListItem[]
  closuresLoading: boolean
  lane: InspectionRow[] | null
  laneLoading: boolean
  /** Latest published inspection date ≤ today ('YYYY-MM-DD'), or null. */
  edge: string | null
  error: string | null
  refetch: () => void
}

// ── pure helpers (exported for tests) ───────────────────────────────────────

interface CardRow { closed?: string; yellow?: string; inspected?: string }
interface RateRow extends CardRow { analysis_neighborhood?: string }
interface EdgeRow { edge?: string }
/** Every FOOD permit closed at least once in the window. */
export interface ClosedPermitRow { permit_number: string; dba?: string; addr?: string; nhood?: string }
/** Every placard reading at those permits, any date ≤ today. */
export interface ReadingRow { permit_number: string; inspection_date: string; facility_rating_status?: string }

const num = (v: string | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function toFigures(row: CardRow | undefined): CardFigures | null {
  if (!row) return null
  return { closed: num(row.closed), yellow: num(row.yellow), inspected: num(row.inspected) }
}

/** Q2 rows → rates. A neighborhood below MIN_RATED keeps its counts but no
 *  share. The null-neighborhood group (places DPH left unplaced — 81 of 6,246
 *  in the `before` window, 2026-09-24) stays as nhood '' with no share, so a
 *  sum over rows still reaches the citywide figure. */
export function toRates(rows: readonly RateRow[]): NeighborhoodRate[] {
  const out: NeighborhoodRate[] = []
  for (const r of rows) {
    const nhood = (r.analysis_neighborhood ?? '').trim()
    const f = toFigures(r) as CardFigures
    const rated = nhood !== '' && f.inspected >= MIN_RATED
    out.push({
      nhood,
      ...f,
      closedShare: rated ? f.closed / f.inspected : null,
      yellowShare: rated ? f.yellow / f.inspected : null,
    })
  }
  return out
}

/** Q3a + Q3b → map points: latest reading per permit, venues and off-map
 *  coordinates dropped, the placard filter applied. */
export function toMapReadings(
  permits: readonly MapPermitRow[],
  nonPass: readonly NonPassRow[],
  placard: 'closure' | 'conditional' | null,
): MapReading[] {
  const latest = latestReadings(permits, nonPass)
  const out: MapReading[] = []
  for (const p of permits) {
    const lat = Number(p.lat)
    const lng = Number(p.lng)
    if (!inSf(lat, lng)) continue
    const addressKey = storefrontKey(p.addr)
    if (isVenue(addressKey)) continue
    const l = latest.get(p.permit_number)
    if (!l) continue
    if (placard === 'closure' && !l.closedInWindow) continue
    if (placard === 'conditional' && !l.yellowInWindow) continue
    out.push({
      permit: p.permit_number,
      name: displayName(p.dba),
      address: displayAddress(p.addr),
      addressKey,
      lat,
      lng,
      lastDate: (p.last_date ?? '').slice(0, 10),
      ...l,
    })
  }
  return out
}

/**
 * "Every closure, newest first": run THE episode rule over each closed
 * permit's full 2024+ reading history (so an episode that began before the
 * window, or cleared after it, keeps its true start and outcome), then keep
 * the episodes with a closure date inside the window. Unit = episode.
 */
export function closuresInWindow(
  permits: readonly ClosedPermitRow[],
  readings: readonly ReadingRow[],
  w: Pick<FeedWindow, 'start' | 'end'>,
  sfToday: string,
): ClosureListItem[] {
  const end = clampedEnd(w, sfToday)
  const episodes = closureEpisodes(
    readings.map((r) => ({ key: r.permit_number, date: r.inspection_date, status: r.facility_rating_status })),
    { sfToday },
  )
  const byPermit = new Map(permits.map((p) => [p.permit_number, p]))
  const out: ClosureListItem[] = []
  for (const ep of episodes) {
    const p = byPermit.get(ep.key)
    if (!p) continue
    if (!ep.closureDates.some((d) => d >= w.start && d <= end)) continue
    out.push({
      ...ep,
      permit: ep.key,
      name: displayName(p.dba),
      address: displayAddress(p.addr),
      addressKey: storefrontKey(p.addr),
      nhood: p.nhood?.trim() || null,
    })
  }
  return out.sort((a, b) => b.start.localeCompare(a.start) || a.name.localeCompare(b.name))
}

/** Step 1 of the closures list — the window's closed FOOD permits (the same
 *  scope as the "Places closed" card, so the list and the card agree). */
export function closedPermitsQuery(w: FeedWindow, sfToday: string) {
  return {
    $select: 'permit_number, max(dba) AS dba, max(street_address_clean) AS addr, max(analysis_neighborhood) AS nhood',
    $where: `${FOOD_WHERE} AND facility_rating_status = 'Closure' AND ${windowClause(w, sfToday)}`,
    $group: 'permit_number',
    $order: 'permit_number',
    $limit: 2_000,
  }
}

/** Step 2 — every placard reading at those permits, 2024 to today. */
export function permitReadingsQuery(permits: readonly string[], sfToday: string) {
  const list = [...new Set(permits)].map((p) => `'${p.replace(/'/g, "''")}'`)
  return {
    $select: 'permit_number, inspection_date, facility_rating_status',
    $where: `${list.length ? `permit_number IN (${list.join(',')})` : '1 = 0'} AND facility_rating_status IS NOT NULL AND ${todayClamp(sfToday)}`,
    $order: 'permit_number, inspection_date',
    $limit: 10_000,
  }
}

/** Q3a plus the latest Pass date per permit — how a same-day closure + pass
 *  resolves to Pass ("cleared the same day") from complete data. */
export function mapPermitsWithPassQuery(w: FeedWindow, sfToday: string) {
  const base = mapPermitsQuery(w, sfToday)
  return { ...base, $select: `${base.$select}, max(case(facility_rating_status='Pass', inspection_date)) AS last_pass` }
}

// ── the hook ────────────────────────────────────────────────────────────────

/** Cold-load stagger: 0 → edge + citywide cards, 1 → map, 2 → rates (and
 *  the neighborhood's cards), 3 → closures list. Mount-only; later changes refetch
 *  only what moved. */
function useColdStage(max: number, stepMs: number): number {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    let n = 0
    const t = setInterval(() => {
      n += 1
      setStage(n)
      if (n >= max) clearInterval(t)
    }, stepMs)
    return () => clearInterval(t)
  }, [max, stepMs])
  return stage
}

export function useRestaurantData(opts: RestaurantDataOptions): RestaurantData {
  // SF-local "today", once per mount (never toISOString — UTC digits).
  const sfToday = useMemo(() => sfLocalCutoff(Date.now()).slice(0, 10), [])
  const w = useMemo(() => feedWindow(opts.window, sfToday), [opts.window, sfToday])
  const stage = useColdStage(3, 350)

  // Q5 · the data edge
  const edgeQ = useDataset<EdgeRow>(
    'restaurantInspections', dataEdgeQuery(sfToday), [],
    { ...SLOW, cite: { viewId: VIEW, purpose: 'freshness' } },
  )

  // Q1 · citywide cards
  const cardsQ = useDataset<CardRow>(
    'restaurantInspections', cardsQuery(w, sfToday), [],
    { ...SLOW, cite: { viewId: VIEW, purpose: 'stat-totals' } },
  )

  // Q3a + Q3b · the map
  const mapEnabled = stage >= 1
  const permitsQ = useDataset<MapPermitRow>(
    'restaurantInspections', mapPermitsWithPassQuery(w, sfToday), [],
    { ...SLOW, enabled: mapEnabled, cite: { viewId: VIEW, purpose: 'map-sample' } },
  )
  const nonPassQ = useDataset<NonPassRow>(
    'restaurantInspections', nonPassReadingsQuery(w, sfToday), [],
    { ...SLOW, enabled: mapEnabled, cite: { viewId: VIEW, purpose: 'map-sample', facet: 'Placards' } },
  )

  // Q2 · neighborhood rates. The selected neighborhood's cards read its Q2
  // row — the same three figures Q1 would return with a neighborhood clause,
  // so no extra request.
  const ratesEnabled = stage >= 2
  const ratesQ = useDataset<RateRow>(
    'restaurantInspections', neighborhoodRatesQuery(w, sfToday), [],
    { ...SLOW, enabled: ratesEnabled, cite: { viewId: VIEW, purpose: 'ranking' } },
  )

  // Every closure in the window: the closed permits, then their readings.
  const closuresEnabled = stage >= 3
  const closedQ = useDataset<ClosedPermitRow>(
    'restaurantInspections', closedPermitsQuery(w, sfToday), [],
    { ...SLOW, enabled: closuresEnabled, cite: { viewId: VIEW, purpose: 'stat-totals', facet: 'Every closure' } },
  )
  const closedPermits = useMemo(() => closedQ.data.map((r) => r.permit_number).sort(), [closedQ.data])
  const readingsEnabled = closuresEnabled && !closedQ.isLoading && closedPermits.length > 0
  const readingsQ = useDataset<ReadingRow>(
    'restaurantInspections', permitReadingsQuery(closedPermits, sfToday), [],
    { ...SLOW, enabled: readingsEnabled, cite: { viewId: VIEW, purpose: 'stat-totals', facet: 'Closure outcomes' } },
  )

  // Q4 · the selected storefront's lane (user-driven; never staggered)
  const lanePermits = useMemo(() => [...new Set(opts.atPermits)].sort(), [opts.atPermits])
  const laneEnabled = lanePermits.length > 0
  const laneQ = useDataset<InspectionRow>(
    'restaurantInspections', storefrontLaneQuery(lanePermits, sfToday), [],
    { ...SLOW, enabled: laneEnabled },
  )

  // DEV tripwire: a permit type the positive table does not know is excluded
  // from every count — name it so the table gets its row (gate G0's twin).
  useEffect(() => {
    if (!import.meta.env?.DEV || !laneQ.data.length) return
    const unknown = unclassifiedPermitTypes(laneQ.data.map((r) => r.permit_type))
    if (unknown.length) console.error('[restaurants] unclassified permit_type — add it to foodPermits.ts:', unknown)
  }, [laneQ.data])

  const mapReadings = useMemo(
    () => toMapReadings(permitsQ.data, nonPassQ.data, opts.placard),
    [permitsQ.data, nonPassQ.data, opts.placard],
  )
  const neighborhoodRates = useMemo(() => toRates(ratesQ.data), [ratesQ.data])
  const nhRow = opts.nh && !ratesQ.isLoading ? neighborhoodRates.find((r) => r.nhood !== '' && r.nhood === opts.nh) : undefined
  // A neighborhood with no inspected place in the window has no Q2 row: zeros.
  const nhFigures: CardFigures | null = !opts.nh || !ratesEnabled || ratesQ.isLoading
    ? null
    : nhRow ? { closed: nhRow.closed, yellow: nhRow.yellow, inspected: nhRow.inspected } : { closed: 0, yellow: 0, inspected: 0 }
  const closuresList = useMemo(
    () => (readingsEnabled ? closuresInWindow(closedQ.data, readingsQ.data, w, sfToday) : []),
    [readingsEnabled, closedQ.data, readingsQ.data, w, sfToday],
  )

  const queries = [edgeQ, cardsQ, permitsQ, nonPassQ, ratesQ, closedQ, readingsQ, laneQ]
  const error = queries.find((q) => q.error)?.error ?? null

  return {
    window: w,
    sfToday,
    cards: { citywide: toFigures(cardsQ.data[0]), nhood: nhFigures },
    cardsLoading: cardsQ.isLoading || (!!opts.nh && nhFigures === null),
    neighborhoodRates,
    ratesLoading: !ratesEnabled || ratesQ.isLoading,
    mapReadings,
    mapLoading: !mapEnabled || permitsQ.isLoading || nonPassQ.isLoading,
    mapTruncated: permitsQ.hitLimit,
    closuresList,
    closuresLoading: !closuresEnabled || closedQ.isLoading || (closedPermits.length > 0 && (!readingsEnabled || readingsQ.isLoading)),
    // A failed lane is null, never [] — [] would read as "no inspections".
    lane: laneEnabled && !laneQ.isLoading && !laneQ.error ? laneQ.data : null,
    laneLoading: laneEnabled && laneQ.isLoading,
    edge: edgeQ.data[0]?.edge?.slice(0, 10) ?? null,
    error,
    refetch: () => queries.forEach((q) => q.refetch()),
  }
}
