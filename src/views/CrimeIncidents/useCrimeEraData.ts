// src/views/CrimeIncidents/useCrimeEraData.ts
//
// All of CrimeIncidents' row and aggregate queries, made era-aware. The view
// asks once and gets modern-shaped results no matter which side of 2018 the
// selected range falls on.
//
// Every query exists twice — once per dataset — because the two SFPD extracts
// share no field names (see crimeEra.ts). Both copies always run as hooks and
// the inactive one is gated off with `enabled`, since React forbids calling a
// hook conditionally. A gated query issues no request and reports not-loading.
//
// Clause building lives HERE, in one place, for both dialects: a half-
// translated WHERE (modern field name, historical dataset) is a 400 at best
// and a silently wrong filter at worst.

import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
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

const MODERN_SELECT =
  'incident_id,incident_number,cad_number,incident_datetime,report_datetime,incident_category,incident_subcategory,incident_description,resolution,intersection,analysis_neighborhood,police_district,latitude,longitude,point'

const ROW_LIMIT = 5000

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
  /** The modern WHERE, for the comparison/trend hooks the view still owns. */
  modernWhere: string
}

const esc = (s: string) => s.replace(/'/g, "''")

export function useCrimeEraData(opts: CrimeEraOpts): CrimeEraData {
  const { dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter } = opts
  const plan = useMemo(() => planCrimeEra(dateRange), [dateRange.start, dateRange.end]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modern clauses (wg3w-h783) ────────────────────────────────────────────
  const modernWhere = useMemo(() => {
    const r = plan.currentRange ?? plan.historicalRange ?? dateRange
    const c: string[] = [
      `incident_datetime >= '${r.start}T00:00:00'`,
      `incident_datetime <= '${r.end}T23:59:59'`,
    ]
    if (categoryClause && plan.categoryFilterAvailable) c.push(categoryClause)
    if (selectedNeighborhood) c.push(`analysis_neighborhood = '${esc(selectedNeighborhood)}'`)
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      c.push(
        startHour <= endHour
          ? `date_extract_hh(incident_datetime) >= ${startHour} AND date_extract_hh(incident_datetime) <= ${endHour}`
          : `(date_extract_hh(incident_datetime) >= ${startHour} OR date_extract_hh(incident_datetime) <= ${endHour})`,
      )
    }
    return c.join(' AND ')
  }, [plan, dateRange, categoryClause, selectedNeighborhood, timeOfDayFilter])

  /** Category aggregation must NOT be narrowed by the category filter, or the
   *  rail only ever shows what is already selected. */
  const modernDateOnly = useMemo(() => {
    const r = plan.currentRange ?? plan.historicalRange ?? dateRange
    const c: string[] = [
      `incident_datetime >= '${r.start}T00:00:00'`,
      `incident_datetime <= '${r.end}T23:59:59'`,
    ]
    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      c.push(
        startHour <= endHour
          ? `date_extract_hh(incident_datetime) >= ${startHour} AND date_extract_hh(incident_datetime) <= ${endHour}`
          : `(date_extract_hh(incident_datetime) >= ${startHour} OR date_extract_hh(incident_datetime) <= ${endHour})`,
      )
    }
    return c.join(' AND ')
  }, [plan, dateRange, timeOfDayFilter])

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

  const wantModern = plan.currentRange != null
  const wantHist = plan.historicalRange != null

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
    const normalized = hist.data
      .map(normalizeHistoricalIncident)
      .filter((r): r is NonNullable<typeof r> => r !== null) as unknown as PoliceIncident[]
    return wantModern && wantHist ? [...modern.data, ...normalized] : wantModern ? modern.data : normalized
  }, [modern.data, hist.data, wantModern, wantHist])

  const totalCount = useMemo(() => {
    const m = wantModern ? parseInt(modernCount.data[0]?.count ?? '', 10) : 0
    const h = wantHist ? parseInt(histCount.data[0]?.count ?? '', 10) : 0
    if (Number.isNaN(m) && Number.isNaN(h)) return null
    const sum = (Number.isNaN(m) ? 0 : m) + (Number.isNaN(h) ? 0 : h)
    // Don't report a total until every ACTIVE source has answered, or a
    // straddling range briefly shows the modern half as if it were the whole.
    if (wantModern && modernCount.data.length === 0) return null
    if (wantHist && histCount.data.length === 0) return null
    return sum
  }, [modernCount.data, histCount.data, wantModern, wantHist])

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
  }, [modernCats.data, histCats.data, wantModern, wantHist])

  const neighborhoodRows = useMemo(() => {
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
  }, [modernNhoods.data, histNhoods.data, wantModern, wantHist])

  const resolutionRows = useMemo(() => {
    if (!wantHist) return modernRes.data
    if (!wantModern) return histRes.data
    return mergeAggRows(
      modernRes.data as unknown as Array<Record<string, string>>,
      histRes.data as unknown as Array<Record<string, string>>,
      'resolution',
      'incident_count',
    ) as unknown as ResolutionAggRow[]
  }, [modernRes.data, histRes.data, wantModern, wantHist])

  return {
    plan,
    incidents,
    isLoading: (wantModern && modern.isLoading) || (wantHist && hist.isLoading),
    error: modern.error ?? hist.error,
    // Either source capping means the map sample is partial.
    hitLimit: (wantModern && modern.hitLimit) || (wantHist && hist.hitLimit),
    refetch: () => {
      if (wantModern) modern.refetch()
      if (wantHist) hist.refetch()
    },
    totalCount,
    linked,
    categoryRows,
    neighborhoodRows,
    resolutionRows,
    modernWhere,
  }
}
