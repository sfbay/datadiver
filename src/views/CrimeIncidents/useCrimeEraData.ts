// src/views/CrimeIncidents/useCrimeEraData.ts
//
// All of CrimeIncidents' row and aggregate queries, made era-aware. The view
// asks once and gets modern-shaped results no matter which side of 2018 the
// selected range falls on (SF) or which city the route resolves to.
//
// Every query exists per dialect, because the sources share no field names
// (see crimeEra.ts / crimeDialect.ts). Every copy always runs as a hook and
// the inactive ones are gated off with `enabled`, since React forbids calling
// a hook conditionally. A gated query issues no request and reports
// not-loading. Oakland is a THIRD gated set, following the same house
// pattern the SF modern/historical split already established.
//
// Clause building lives in crimeDialect.ts / crimeEra.ts, one place per
// dialect: a half-translated WHERE (modern field name, historical dataset,
// or SF field name against Oakland's endpoint) is a 400 at best and a
// silently wrong filter at worst.

import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { useRouteView } from '@/cities/useActiveCity'
import { OAKLAND_BEATS } from '@/cities/oakland/beats'
import type {
  PoliceIncident,
  IncidentCategoryAggRow,
  NeighborhoodAggRowPolice,
  ResolutionAggRow,
} from '@/types/datasets'
import {
  planCrimeEra,
  normalizeHistoricalIncident,
  historicalHourClause,
  mergeAggRows,
  HISTORICAL_FIELDS,
  HISTORICAL_SELECT_FIELDS,
  HISTORICAL_NEIGHBORHOOD_BY_REGION_ID,
  type CrimeEraPlan,
  type HistoricalIncidentRow,
} from './crimeEra'
import {
  adaptOaklandIncident, buildOaklandCrimeWhere, buildOaklandCrimeDateOnly,
  buildSfCrimeWhere, buildSfCrimeDateOnly,
  OAKLAND_CRIME_COUNT, OAKLAND_CRIME_SELECT, type OaklandCrimeRow,
} from './crimeDialect'

const MODERN_SELECT =
  'incident_id,incident_number,cad_number,incident_datetime,report_datetime,incident_category,incident_subcategory,incident_description,resolution,intersection,analysis_neighborhood,police_district,latitude,longitude,point'

const ROW_LIMIT = 5000

const BEAT_SET: ReadonlySet<string> = new Set(OAKLAND_BEATS)

export interface CrimeEraOpts {
  dateRange: { start: string; end: string }
  /** Modern-vocabulary category filter; ignored whenever historical rows are
   *  in range (plan.categoryFilterAvailable === false). */
  categoryClause: string
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}

export interface CrimeEraData {
  plan: CrimeEraPlan
  incidents: PoliceIncident[]
  isLoading: boolean
  error: string | null
  hitLimit: boolean
  refetch: () => void
  totalCount: number | null
  /** 911 cross-reference counts. null when the range includes pre-2018 rows,
   *  which have no cad_number — the card must say so, not show a wrong ratio. */
  linked: { total: number; linked: number } | null
  categoryRows: IncidentCategoryAggRow[]
  neighborhoodRows: NeighborhoodAggRowPolice[]
  resolutionRows: ResolutionAggRow[]
  /** The ACTIVE row-WHERE for the view's comparison/trend hooks — SF modern
   *  dialect or the Oakland beat dialect. */
  modernWhere: string
  /** Oakland: share of counted incidents whose beat is NULL or an out-of-beat
   *  code with no polygon. null for SF. */
  unmappedShare: number | null
}

export function useCrimeEraData(opts: CrimeEraOpts): CrimeEraData {
  const { dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter } = opts
  const cityId = useRouteView().cityId
  const isSF = cityId === 'sf'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planCrimeEra(dateRange, cityId), [dateRange.start, dateRange.end, cityId])

  // ── Modern clauses (wg3w-h783) — delegate to the extracted, parity-pinned
  // builders. Behavior is byte-identical to the pre-extraction inline logic. ─
  const modernWhere = useMemo(() => {
    const r = plan.currentRange ?? plan.historicalRange ?? dateRange
    return buildSfCrimeWhere({
      dateRange: r,
      categoryClause,
      selectedNeighborhood,
      timeOfDayFilter,
      categoryFilterAvailable: plan.categoryFilterAvailable,
    })
  }, [plan, dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter])

  /** Category aggregation must NOT be narrowed by the category filter, or the
   *  rail only ever shows what is already selected. */
  const modernDateOnly = useMemo(() => {
    const r = plan.currentRange ?? plan.historicalRange ?? dateRange
    return buildSfCrimeDateOnly({ dateRange: r, timeOfDayFilter })
  }, [plan, dateRange, timeOfDayFilter])

  // ── Oakland clauses (ppgh-7dqv) ────────────────────────────────────────────
  const oakWhere = useMemo(
    () => buildOaklandCrimeWhere({ dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter }),
    [dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter],
  )
  const oakDateOnly = useMemo(
    () => buildOaklandCrimeDateOnly({ dateRange, timeOfDayFilter }),
    [dateRange, timeOfDayFilter],
  )

  // ── Historical clauses (tmnf-yvry) ────────────────────────────────────────
  // `date` is date-only, so the upper bound is inclusive on the day itself —
  // no T23:59:59 suffix, which would never match a midnight-stamped column.
  const histWhere = useMemo(() => {
    const r = plan.historicalRange
    if (!r) return ''
    const D = HISTORICAL_FIELDS.date
    const c: string[] = [`${D} >= '${r.start}' AND ${D} <= '${r.end}'`]
    if (selectedNeighborhood) {
      // The historical set stores a region ID, not a name — translate, and if
      // the name is unknown force an empty result rather than dropping the
      // filter (a dropped filter silently shows the whole city).
      const id = Object.keys(HISTORICAL_NEIGHBORHOOD_BY_REGION_ID).find(
        (k) => HISTORICAL_NEIGHBORHOOD_BY_REGION_ID[k] === selectedNeighborhood,
      )
      c.push(id ? `${HISTORICAL_FIELDS.neighborhoodRegion} = '${id}'` : '1 = 0')
    }
    if (timeOfDayFilter) {
      const clause = historicalHourClause(timeOfDayFilter.startHour, timeOfDayFilter.endHour)
      if (clause) c.push(clause)
    }
    return c.join(' AND ')
  }, [plan, selectedNeighborhood, timeOfDayFilter])

  const wantModern = isSF && plan.currentRange != null
  const wantHist = isSF && plan.historicalRange != null
  const wantOak = !isSF

  // ── Row queries ───────────────────────────────────────────────────────────
  const modern = useDataset<PoliceIncident>(
    'policeIncidents',
    { $where: modernWhere, $limit: ROW_LIMIT, $select: MODERN_SELECT },
    [modernWhere],
    { enabled: wantModern },
  )
  const hist = useDataset<HistoricalIncidentRow>(
    'policeIncidentsHistorical',
    { $where: histWhere, $limit: ROW_LIMIT, $select: HISTORICAL_SELECT_FIELDS },
    [histWhere],
    { enabled: wantHist },
  )
  const oak = useDataset<OaklandCrimeRow>(
    'policeIncidents',
    { $where: oakWhere, $limit: ROW_LIMIT, $select: OAKLAND_CRIME_SELECT },
    [oakWhere],
    { enabled: wantOak },
  )

  // ── Aggregates ────────────────────────────────────────────────────────────
  const modernCount = useDataset<{ count: string }>(
    'policeIncidents',
    { $select: 'count(*) as count', $where: modernWhere },
    [modernWhere],
    { enabled: wantModern },
  )
  const histCount = useDataset<{ count: string }>(
    'policeIncidentsHistorical',
    { $select: 'count(*) as count', $where: histWhere },
    [histWhere],
    { enabled: wantHist },
  )
  const oakCount = useDataset<{ count: string }>(
    'policeIncidents',
    { $select: `${OAKLAND_CRIME_COUNT} as count`, $where: oakWhere },
    [oakWhere],
    { enabled: wantOak },
  )

  const modernLinked = useDataset<{ total_count: string; linked_count: string }>(
    'policeIncidents',
    { $select: 'count(*) as total_count, count(cad_number) as linked_count', $where: modernWhere, $limit: 1 },
    [modernWhere],
    { enabled: wantModern && plan.cadLinkAvailable },
  )

  const modernCats = useDataset<IncidentCategoryAggRow>(
    'policeIncidents',
    {
      $select: 'incident_category, count(*) as incident_count',
      $group: 'incident_category',
      $where: modernDateOnly,
      $order: 'incident_count DESC',
      $limit: 60,
    },
    [modernDateOnly],
    { enabled: wantModern },
  )
  const histCats = useDataset<{ category: string; incident_count: string }>(
    'policeIncidentsHistorical',
    {
      $select: `${HISTORICAL_FIELDS.category} as category, count(*) as incident_count`,
      $group: HISTORICAL_FIELDS.category,
      $where: histWhere,
      $order: 'incident_count DESC',
      $limit: 60,
    },
    [histWhere],
    { enabled: wantHist },
  )
  const oakCats = useDataset<IncidentCategoryAggRow>(
    'policeIncidents',
    {
      $select: `crimetype as incident_category, ${OAKLAND_CRIME_COUNT} as incident_count`,
      $group: 'crimetype',
      $where: oakDateOnly,
      $order: 'incident_count DESC',
      $limit: 60,
    },
    [oakDateOnly],
    { enabled: wantOak },
  )

  const modernNhoods = useDataset<NeighborhoodAggRowPolice>(
    'policeIncidents',
    {
      $select: 'analysis_neighborhood, count(*) as incident_count',
      $group: 'analysis_neighborhood',
      $where: modernWhere,
      $order: 'incident_count DESC',
      $limit: 50,
    },
    [modernWhere],
    { enabled: wantModern },
  )
  const histNhoods = useDataset<{ region_id: string; incident_count: string }>(
    'policeIncidentsHistorical',
    {
      $select: `${HISTORICAL_FIELDS.neighborhoodRegion} as region_id, count(*) as incident_count`,
      $group: HISTORICAL_FIELDS.neighborhoodRegion,
      $where: histWhere,
      $order: 'incident_count DESC',
      $limit: 50,
    },
    [histWhere],
    { enabled: wantHist },
  )
  // $limit 200: 59 beats + junk codes (77X/99X) + the NULL row must ALL
  // arrive — the unmapped-share disclosure is computed from this result.
  // The malformed beat-code tail can exceed 70 groups; under DESC ordering,
  // truncation drops the smallest (unmapped) groups first, biasing the
  // unmappedShare disclosure LOW.
  const oakNhoods = useDataset<NeighborhoodAggRowPolice>(
    'policeIncidents',
    {
      $select: `policebeat as analysis_neighborhood, ${OAKLAND_CRIME_COUNT} as incident_count`,
      $group: 'policebeat',
      $where: oakWhere,
      $order: 'incident_count DESC',
      $limit: 200,
    },
    [oakWhere],
    { enabled: wantOak },
  )

  const modernRes = useDataset<ResolutionAggRow>(
    'policeIncidents',
    {
      $select: 'resolution, count(*) as incident_count',
      $group: 'resolution',
      $where: modernWhere,
      $order: 'incident_count DESC',
      $limit: 20,
    },
    [modernWhere],
    { enabled: wantModern },
  )
  const histRes = useDataset<ResolutionAggRow>(
    'policeIncidentsHistorical',
    {
      $select: `${HISTORICAL_FIELDS.resolution} as resolution, count(*) as incident_count`,
      $group: HISTORICAL_FIELDS.resolution,
      $where: histWhere,
      $order: 'incident_count DESC',
      $limit: 20,
    },
    [histWhere],
    { enabled: wantHist },
  )

  // ── Merge ─────────────────────────────────────────────────────────────────
  const incidents = useMemo(() => {
    // Oakland's ppgh-7dqv rows are CHARGES: a case with multiple charges
    // publishes one row per charge, all sharing datetime/location. Dedupe on
    // casenumber (keep first) before adapting, or the map/list over-counts.
    if (wantOak) {
      const seen = new Set<string>()
      const out: PoliceIncident[] = []
      for (const r of oak.data) {
        const key = r.casenumber ?? ''
        if (key) {
          if (seen.has(key)) continue
          seen.add(key)
        }
        const adapted = adaptOaklandIncident(r)
        // The adapted row is typed by its OWN interface (AdaptedOaklandIncident)
        // and only the final value takes the typed-lie cast — the same
        // precedent normalizeHistoricalIncident set. Absent fields ride as
        // empty strings; every UI surface that would read them is
        // withheld/gated (911 chip self-suppresses on empty cadNumber,
        // Resolution tooltip row + tile are SF-only).
        if (adapted) out.push(adapted as unknown as PoliceIncident)
      }
      return out
    }
    const normalized = hist.data
      .map(normalizeHistoricalIncident)
      .filter((r): r is NonNullable<typeof r> => r !== null) as unknown as PoliceIncident[]
    return wantModern && wantHist ? [...modern.data, ...normalized] : wantModern ? modern.data : normalized
  }, [wantOak, oak.data, modern.data, hist.data, wantModern, wantHist])

  const totalCount = useMemo(() => {
    if (wantOak) {
      const n = parseInt(oakCount.data[0]?.count ?? '', 10)
      return Number.isNaN(n) ? null : n
    }
    const m = wantModern ? parseInt(modernCount.data[0]?.count ?? '', 10) : 0
    const h = wantHist ? parseInt(histCount.data[0]?.count ?? '', 10) : 0
    if (Number.isNaN(m) && Number.isNaN(h)) return null
    const sum = (Number.isNaN(m) ? 0 : m) + (Number.isNaN(h) ? 0 : h)
    // Don't report a total until every ACTIVE source has answered, or a
    // straddling range briefly shows the modern half as if it were the whole.
    if (wantModern && modernCount.data.length === 0) return null
    if (wantHist && histCount.data.length === 0) return null
    return sum
  }, [wantOak, oakCount.data, modernCount.data, histCount.data, wantModern, wantHist])

  const linked = useMemo(() => {
    if (!plan.cadLinkAvailable) return null
    const row = modernLinked.data[0]
    if (!row) return null
    return {
      total: parseInt(row.total_count, 10) || 0,
      linked: parseInt(row.linked_count, 10) || 0,
    }
  }, [modernLinked.data, plan.cadLinkAvailable])

  const categoryRows = useMemo(() => {
    if (wantOak) return oakCats.data
    const h = histCats.data.map((r) => ({
      incident_category: r.category,
      incident_count: r.incident_count,
    }))
    if (!wantHist) return modernCats.data
    if (!wantModern) return h as IncidentCategoryAggRow[]
    // Deliberately NOT unified: the two eras use different category systems,
    // so a straddling range lists both vocabularies rather than inventing a
    // mapping between them. The view discloses this.
    return mergeAggRows(
      modernCats.data as unknown as Array<Record<string, string>>,
      h,
      'incident_category',
      'incident_count',
    ) as unknown as IncidentCategoryAggRow[]
  }, [wantOak, oakCats.data, modernCats.data, histCats.data, wantModern, wantHist])

  const neighborhoodRows = useMemo(() => {
    if (wantOak) {
      return oakNhoods.data.filter(
        (r) => r.analysis_neighborhood && BEAT_SET.has(r.analysis_neighborhood),
      )
    }
    const h = histNhoods.data
      .map((r) => ({
        analysis_neighborhood: HISTORICAL_NEIGHBORHOOD_BY_REGION_ID[r.region_id] ?? '',
        incident_count: r.incident_count,
      }))
      .filter((r) => r.analysis_neighborhood !== '')
    if (!wantHist) return modernNhoods.data
    if (!wantModern) return h as NeighborhoodAggRowPolice[]
    return mergeAggRows(
      modernNhoods.data as unknown as Array<Record<string, string>>,
      h,
      'analysis_neighborhood',
      'incident_count',
    ) as unknown as NeighborhoodAggRowPolice[]
  }, [wantOak, oakNhoods.data, modernNhoods.data, histNhoods.data, wantModern, wantHist])

  const resolutionRows = useMemo(() => {
    if (wantOak) return []
    if (!wantHist) return modernRes.data
    if (!wantModern) return histRes.data
    return mergeAggRows(
      modernRes.data as unknown as Array<Record<string, string>>,
      histRes.data as unknown as Array<Record<string, string>>,
      'resolution',
      'incident_count',
    ) as unknown as ResolutionAggRow[]
  }, [wantOak, modernRes.data, histRes.data, wantModern, wantHist])

  /** Oakland: share of counted incidents whose beat is NULL or an
   *  out-of-beat code with no polygon (77X, 99X — ~4.8% together). These
   *  rows count in citywide totals but can't appear on the beat ranking or
   *  choropleth; the view MUST disclose the share (stage-2 spec hard
   *  requirement). null for SF. */
  const unmappedShare = useMemo(() => {
    if (!wantOak || oakNhoods.data.length === 0) return null
    let mapped = 0
    let unmapped = 0
    for (const r of oakNhoods.data) {
      const n = parseInt(r.incident_count, 10) || 0
      if (r.analysis_neighborhood && BEAT_SET.has(r.analysis_neighborhood)) mapped += n
      else unmapped += n
    }
    const total = mapped + unmapped
    return total > 0 ? unmapped / total : null
  }, [wantOak, oakNhoods.data])

  return {
    plan,
    incidents,
    isLoading: (wantModern && modern.isLoading) || (wantHist && hist.isLoading) || (wantOak && oak.isLoading),
    error: modern.error ?? hist.error ?? oak.error,
    // Either source capping means the map sample is partial.
    hitLimit: (wantModern && modern.hitLimit) || (wantHist && hist.hitLimit) || (wantOak && oak.hitLimit),
    refetch: () => {
      if (wantModern) modern.refetch()
      if (wantHist) hist.refetch()
      if (wantOak) oak.refetch()
    },
    totalCount,
    linked,
    categoryRows,
    neighborhoodRows,
    resolutionRows,
    modernWhere: isSF ? modernWhere : oakWhere,
    unmappedShare,
  }
}
