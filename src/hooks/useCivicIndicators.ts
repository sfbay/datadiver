/**
 * Cross-view civic indicator engine — fires ~10 parallel Socrata queries
 * to produce TickerItems surfacing trends, anomalies, and milestones
 * across all DataDiver datasets.
 *
 * Module-level cache with 5-minute refresh. Uses Promise.allSettled so
 * one dataset failure doesn't kill all indicators.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'
import { yearAgo } from '@/utils/time'
import type { TickerItem, TickerCategory, TickerSeverity } from '@/types/ticker'

// ── Module-level cache ──────────────────────────────────────────

interface CacheEntry {
  items: TickerItem[]
  timestamp: number
  dateKey: string
}

const CACHE_TTL = 30 * 60 * 1000 // 30 minutes — indicators change slowly (30-day windows)
let indicatorCache: CacheEntry | null = null

// ── Public hook interface ───────────────────────────────────────

interface UseCivicIndicatorsOptions {
  /** Which dataset keys to include (default: all) */
  datasets?: string[]
  /** Max items to return */
  limit?: number
  /**
   * Defer the ~8 parallel indicator queries until true (default: true).
   * Home passes `showTicker` so the ticker's queries don't compete with the
   * hero investigation cards at mount; the cache means a later view loads
   * instantly anyway.
   */
  enabled?: boolean
}

interface UseCivicIndicatorsResult {
  items: TickerItem[]
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useCivicIndicators(
  options?: UseCivicIndicatorsOptions
): UseCivicIndicatorsResult {
  const dateRange = useAppStore((s) => s.dateRange)
  const [items, setItems] = useState<TickerItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const abortRef = useRef(false)

  const limit = options?.limit ?? 15
  const datasetFilter = options?.datasets
  const enabled = options?.enabled ?? true

  useEffect(() => {
    // Deferred consumer: hold isLoading at its initial `true` and fire nothing
    // until enabled flips (the ticker UI stays skeletoned in the meantime).
    if (!enabled) return

    abortRef.current = false
    const dateKey = `${dateRange.start}|${dateRange.end}`

    // Check module-level cache
    if (
      indicatorCache &&
      indicatorCache.dateKey === dateKey &&
      Date.now() - indicatorCache.timestamp < CACHE_TTL
    ) {
      const filtered = applyFilters(indicatorCache.items, datasetFilter, limit)
      setItems(filtered)
      setIsLoading(false)
      setLastUpdated(new Date(indicatorCache.timestamp))
      return
    }

    setIsLoading(true)
    setError(null)

    computeAllIndicators(dateRange).then((allItems) => {
      if (abortRef.current) return

      // Sort by priority desc, then by absolute delta desc
      allItems.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)
      })

      // Update module-level cache
      indicatorCache = { items: allItems, timestamp: Date.now(), dateKey }

      const filtered = applyFilters(allItems, datasetFilter, limit)
      setItems(filtered)
      setLastUpdated(new Date())
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to compute indicators')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, limit, datasetFilter?.join(','), enabled])

  return { items, isLoading, error, lastUpdated }
}

// ── Filter + limit helper ───────────────────────────────────────

function applyFilters(
  items: TickerItem[],
  datasets: string[] | undefined,
  limit: number
): TickerItem[] {
  let result = items
  if (datasets && datasets.length > 0) {
    const set = new Set(datasets)
    result = result.filter((item) => {
      const dsId = item.source.datasetId
      return dsId ? set.has(dsId) : false
    })
  }
  return result.slice(0, limit)
}

// ── Orchestrator — fires all queries in parallel ────────────────

async function computeAllIndicators(
  dateRange: { start: string; end: string }
): Promise<TickerItem[]> {
  const now = new Date()
  const curStart = `${dateRange.start}T00:00:00`
  const curEnd = `${dateRange.end}T23:59:59`
  const priStart = `${yearAgo(dateRange.start)}T00:00:00`
  const priEnd = `${yearAgo(dateRange.end)}T23:59:59`

  const ctx: QueryContext = { curStart, curEnd, priStart, priEnd, now }

  const results = await Promise.allSettled([
    fetchEmergencyResponse(ctx),
    fetch311Cases(ctx),
    fetchCrimeIncidents(ctx),
    fetchTrafficSafety(ctx),
    fetchBusinessActivity(ctx),
    fetchParkingRevenue(ctx),
    fetchParkingCitations(ctx),
    fetchCampaignFinance(ctx),
  ])

  const items: TickerItem[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      items.push(result.value)
    }
  }
  return items
}

// ── Shared types ────────────────────────────────────────────────

interface QueryContext {
  curStart: string
  curEnd: string
  priStart: string
  priEnd: string
  now: Date
}

interface CountRow { cnt: string }
interface SparkRow { day: string; cnt: string }

// ── Helpers ─────────────────────────────────────────────────────

function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0
  return ((current - prior) / prior) * 100
}

function deltaSeverity(delta: number, higherIsBad: boolean): TickerSeverity {
  const threshold = 5
  if (Math.abs(delta) < threshold) return 'neutral'
  const isUp = delta > 0
  if (higherIsBad) return isUp ? 'negative' : 'positive'
  return isUp ? 'positive' : 'negative'
}

function deltaCategory(delta: number, zScore?: number): TickerCategory {
  if (zScore !== undefined && Math.abs(zScore) >= 2) return 'anomaly'
  return 'trend'
}

function priorityFromCategory(cat: TickerCategory): number {
  switch (cat) {
    case 'anomaly': return 90
    case 'compliance': return 85
    case 'live': return 95
    case 'trend': return 70
    case 'milestone': return 60
  }
}

/** Check if a dataset has recent data — returns null if stale (data gap).
 *  High-latency datasets (traffic crashes, parking citations geo) may have
 *  weeks of lag, producing misleading -100% deltas from data absence. */
async function checkFreshness(
  datasetKey: string,
  dateField: string,
  maxAgeDays: number,
): Promise<boolean> {
  try {
    const rows = await fetchDataset<{ max_date: string }>(datasetKey as any, {
      $select: `MAX(${dateField}) as max_date`,
      $limit: 1,
    })
    if (!rows[0]?.max_date) return false
    const maxDate = new Date(rows[0].max_date)
    const ageDays = (Date.now() - maxDate.getTime()) / (1000 * 60 * 60 * 24)
    return ageDays <= maxAgeDays
  } catch {
    return false
  }
}

async function fetchSparkline(
  datasetKey: string,
  dateField: string,
  curStart: string,
  curEnd: string,
  extraWhere?: string
): Promise<number[]> {
  try {
    const where = [
      `${dateField} >= '${curStart}'`,
      `${dateField} <= '${curEnd}'`,
      ...(extraWhere ? [extraWhere] : []),
    ].join(' AND ')

    const rows = await fetchDataset<SparkRow>(datasetKey as any, {
      $select: `date_trunc_ymd(${dateField}) as day, count(*) as cnt`,
      $where: where,
      $group: 'day',
      $order: 'day ASC',
      $limit: 60,
    })
    return rows.map((r) => parseInt(r.cnt, 10) || 0)
  } catch {
    return []
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

// ── Per-dataset transformer functions ───────────────────────────

// 1. Emergency Response (Fire/EMS Dispatch)
async function fetchEmergencyResponse(ctx: QueryContext): Promise<TickerItem | null> {
  const [curRows, priRows, spark] = await Promise.all([
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'count(*) as cnt',
      $where: `received_dttm >= '${ctx.curStart}' AND received_dttm <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'count(*) as cnt',
      $where: `received_dttm >= '${ctx.priStart}' AND received_dttm <= '${ctx.priEnd}'`,
      $limit: 1,
    }),
    fetchSparkline('fireEMSDispatch', 'received_dttm', ctx.curStart, ctx.curEnd),
  ])

  const current = parseInt(curRows[0]?.cnt, 10) || 0
  const prior = parseInt(priRows[0]?.cnt, 10) || 0
  if (current === 0 && prior === 0) return null

  const delta = pctDelta(current, prior)
  const category = deltaCategory(delta)
  const severity = deltaSeverity(delta, true) // more calls = worse

  return {
    id: 'civic-emergency-response',
    headline: `SFFD Dispatch: ${formatPct(delta)} vs last year · ${formatCount(current)} calls`,
    detail: `${formatCount(prior)} calls in prior year period`,
    category,
    severity,
    source: {
      view: '/emergency-response',
      label: 'Emergency Response',
      datasetId: 'nuek-vuh3',
    },
    sparkData: spark,
    delta,
    value: formatCount(current),
    priorValue: formatCount(prior),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: priorityFromCategory(category),
  }
}

// 2. 311 Cases — top anomaly neighborhood
async function fetch311Cases(ctx: QueryContext): Promise<TickerItem | null> {
  interface NhRow { analysis_neighborhood: string; cnt: string }

  const [curRows, priRows, spark] = await Promise.all([
    fetchDataset<NhRow>('cases311', {
      $select: 'analysis_neighborhood, count(*) as cnt',
      $where: `requested_datetime >= '${ctx.curStart}' AND requested_datetime <= '${ctx.curEnd}'`,
      $group: 'analysis_neighborhood',
      $order: 'cnt DESC',
      $limit: 50,
    }),
    fetchDataset<NhRow>('cases311', {
      $select: 'analysis_neighborhood, count(*) as cnt',
      $where: `requested_datetime >= '${ctx.priStart}' AND requested_datetime <= '${ctx.priEnd}'`,
      $group: 'analysis_neighborhood',
      $order: 'cnt DESC',
      $limit: 50,
    }),
    fetchSparkline('cases311', 'requested_datetime', ctx.curStart, ctx.curEnd),
  ])

  if (curRows.length === 0) return null

  // Find neighborhood with highest YoY increase
  const priorMap = new Map(priRows.map((r) => [r.analysis_neighborhood, parseInt(r.cnt, 10) || 0]))
  let topNh = curRows[0].analysis_neighborhood
  let topDelta = 0
  let topCurrent = 0

  for (const row of curRows) {
    if (!row.analysis_neighborhood) continue
    const cur = parseInt(row.cnt, 10) || 0
    const pri = priorMap.get(row.analysis_neighborhood) ?? 0
    const d = pctDelta(cur, pri)
    if (Math.abs(d) > Math.abs(topDelta) && pri > 10) {
      topDelta = d
      topNh = row.analysis_neighborhood
      topCurrent = cur
    }
  }

  const totalCurrent = curRows.reduce((s, r) => s + (parseInt(r.cnt, 10) || 0), 0)
  const totalPrior = priRows.reduce((s, r) => s + (parseInt(r.cnt, 10) || 0), 0)
  const cityDelta = pctDelta(totalCurrent, totalPrior)

  // Use neighborhood anomaly if dramatic, otherwise city-wide trend
  const isAnomaly = Math.abs(topDelta) > 30
  const headline = isAnomaly
    ? `${topNh} 311 volume ${formatPct(topDelta)} vs last year · ${formatCount(topCurrent)} cases`
    : `311 Cases: ${formatPct(cityDelta)} citywide · ${formatCount(totalCurrent)} cases`

  const category: TickerCategory = isAnomaly ? 'anomaly' : 'trend'
  const severity = deltaSeverity(isAnomaly ? topDelta : cityDelta, true)

  return {
    id: 'civic-311-cases',
    headline,
    detail: isAnomaly ? `Citywide: ${formatCount(totalCurrent)} total` : undefined,
    category,
    severity,
    source: {
      view: '/311-cases',
      params: isAnomaly ? { neighborhood: topNh } : undefined,
      label: isAnomaly ? `311 Cases · ${topNh}` : '311 Cases',
      datasetId: 'vw6y-z8j6',
    },
    sparkData: spark,
    delta: isAnomaly ? topDelta : cityDelta,
    value: formatCount(isAnomaly ? topCurrent : totalCurrent),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: priorityFromCategory(category),
  }
}

// 3. Crime Incidents — violent crime trend
async function fetchCrimeIncidents(ctx: QueryContext): Promise<TickerItem | null> {
  const violentWhere = "incident_category IN ('Assault', 'Robbery', 'Homicide', 'Rape')"

  const [curRows, priRows, spark] = await Promise.all([
    fetchDataset<CountRow>('policeIncidents', {
      $select: 'count(*) as cnt',
      $where: `incident_datetime >= '${ctx.curStart}' AND incident_datetime <= '${ctx.curEnd}' AND ${violentWhere}`,
      $limit: 1,
    }),
    fetchDataset<CountRow>('policeIncidents', {
      $select: 'count(*) as cnt',
      $where: `incident_datetime >= '${ctx.priStart}' AND incident_datetime <= '${ctx.priEnd}' AND ${violentWhere}`,
      $limit: 1,
    }),
    fetchSparkline('policeIncidents', 'incident_datetime', ctx.curStart, ctx.curEnd, violentWhere),
  ])

  const current = parseInt(curRows[0]?.cnt, 10) || 0
  const prior = parseInt(priRows[0]?.cnt, 10) || 0
  if (current === 0 && prior === 0) return null

  const delta = pctDelta(current, prior)
  const category = deltaCategory(delta)
  const severity = deltaSeverity(delta, true) // more crime = worse

  return {
    id: 'civic-crime-incidents',
    headline: `Violent crime ${formatPct(delta)} vs prior year · ${formatCount(current)} incidents`,
    detail: `${formatCount(prior)} in prior year period`,
    category,
    severity,
    source: {
      view: '/crime-incidents',
      params: { categories: 'violent' },
      label: 'Crime Incidents · Violent',
      datasetId: 'wg3w-h783',
    },
    sparkData: spark,
    delta,
    value: formatCount(current),
    priorValue: formatCount(prior),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: priorityFromCategory(category),
  }
}

// 4. Traffic Safety — fatalities + crash trend
async function fetchTrafficSafety(ctx: QueryContext): Promise<TickerItem | null> {
  // Freshness gate: crash data has high reporting latency (weeks/months)
  const isFresh = await checkFreshness('trafficCrashes', 'collision_datetime', 60)
  if (!isFresh) return null  // suppress rather than show misleading -100%

  interface CrashRow { crash_count: string; total_killed: string; total_injured: string }

  const [curRows, priRows, spark] = await Promise.all([
    fetchDataset<CrashRow>('trafficCrashes', {
      $select: 'count(*) as crash_count, sum(number_killed) as total_killed, sum(number_injured) as total_injured',
      $where: `collision_datetime >= '${ctx.curStart}' AND collision_datetime <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
    fetchDataset<CrashRow>('trafficCrashes', {
      $select: 'count(*) as crash_count, sum(number_killed) as total_killed, sum(number_injured) as total_injured',
      $where: `collision_datetime >= '${ctx.priStart}' AND collision_datetime <= '${ctx.priEnd}'`,
      $limit: 1,
    }),
    fetchSparkline('trafficCrashes', 'collision_datetime', ctx.curStart, ctx.curEnd),
  ])

  const curCrashes = parseInt(curRows[0]?.crash_count, 10) || 0
  const priCrashes = parseInt(priRows[0]?.crash_count, 10) || 0
  const killed = parseInt(curRows[0]?.total_killed, 10) || 0
  const injured = parseInt(curRows[0]?.total_injured, 10) || 0
  if (curCrashes === 0 && priCrashes === 0) return null

  const delta = pctDelta(curCrashes, priCrashes)
  const category = killed > 0 ? 'anomaly' as TickerCategory : deltaCategory(delta)
  const severity = killed > 0 ? 'alert' as TickerSeverity : deltaSeverity(delta, true)

  return {
    id: 'civic-traffic-safety',
    headline: killed > 0
      ? `Traffic: ${killed} fatalities, ${injured} injured · Crashes ${formatPct(delta)}`
      : `Traffic crashes ${formatPct(delta)} vs last year · ${formatCount(curCrashes)} total`,
    detail: `${formatCount(priCrashes)} crashes in prior year period`,
    category,
    severity,
    source: {
      view: '/traffic-safety',
      label: 'Traffic Safety',
      datasetId: 'ubvf-ztfx',
    },
    sparkData: spark,
    delta,
    value: formatCount(curCrashes),
    priorValue: formatCount(priCrashes),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: priorityFromCategory(category),
  }
}

// 5. Business Activity — net formation
async function fetchBusinessActivity(ctx: QueryContext): Promise<TickerItem | null> {
  const [openRows, closeRows] = await Promise.all([
    fetchDataset<CountRow>('businessLocations', {
      $select: 'count(*) as cnt',
      $where: `dba_start_date >= '${ctx.curStart}' AND dba_start_date <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
    fetchDataset<CountRow>('businessLocations', {
      $select: 'count(*) as cnt',
      $where: `dba_end_date >= '${ctx.curStart}' AND dba_end_date <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
  ])

  const openings = parseInt(openRows[0]?.cnt, 10) || 0
  const closures = parseInt(closeRows[0]?.cnt, 10) || 0
  const net = openings - closures
  if (openings === 0 && closures === 0) return null

  const sign = net >= 0 ? '+' : ''
  const severity: TickerSeverity = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral'

  return {
    id: 'civic-business-activity',
    headline: `Net business formation: ${sign}${net} · ${formatCount(openings)} opened, ${formatCount(closures)} closed`,
    category: 'trend',
    severity,
    source: {
      view: '/business-activity',
      label: 'Business Activity',
      datasetId: 'g8m3-pdis',
    },
    delta: closures > 0 ? pctDelta(openings, closures) : undefined,
    value: `${sign}${net}`,
    freshness: 'daily',
    computedAt: ctx.now,
    priority: 70,
  }
}

// 6. Parking Revenue — revenue trend
async function fetchParkingRevenue(ctx: QueryContext): Promise<TickerItem | null> {
  interface RevRow { total: string }

  const [curRows, priRows] = await Promise.all([
    fetchDataset<RevRow>('parkingRevenue', {
      $select: 'sum(gross_paid_amt) as total',
      $where: `session_start_dt >= '${ctx.curStart}' AND session_start_dt <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
    fetchDataset<RevRow>('parkingRevenue', {
      $select: 'sum(gross_paid_amt) as total',
      $where: `session_start_dt >= '${ctx.priStart}' AND session_start_dt <= '${ctx.priEnd}'`,
      $limit: 1,
    }),
  ])

  const current = parseFloat(curRows[0]?.total) || 0
  const prior = parseFloat(priRows[0]?.total) || 0
  if (current === 0 && prior === 0) return null

  const delta = pctDelta(current, prior)
  const severity = deltaSeverity(delta, false) // more revenue = good

  return {
    id: 'civic-parking-revenue',
    headline: `Parking revenue ${formatPct(delta)} vs last year · ${formatCurrency(current)}`,
    detail: `${formatCurrency(prior)} in prior year period`,
    category: 'trend',
    severity,
    source: {
      view: '/parking-revenue',
      label: 'Parking Revenue',
      datasetId: 'imvp-dq3v',
    },
    delta,
    value: formatCurrency(current),
    priorValue: formatCurrency(prior),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: 70,
  }
}

// 7. Parking Citations — volume + out-of-state share
async function fetchParkingCitations(ctx: QueryContext): Promise<TickerItem | null> {
  // Freshness gate: citation geo data has a known gap after Oct 2025
  const isFresh = await checkFreshness('parkingCitations', 'citation_issued_datetime', 45)
  if (!isFresh) return null

  interface CitRow { cnt: string; oos_cnt: string }

  const [curRows, spark] = await Promise.all([
    fetchDataset<CitRow>('parkingCitations', {
      $select: "count(*) as cnt, sum(case(vehicle_plate_state != 'CA', 1, true, 0)) as oos_cnt",
      $where: `citation_issued_datetime >= '${ctx.curStart}' AND citation_issued_datetime <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
    fetchSparkline('parkingCitations', 'citation_issued_datetime', ctx.curStart, ctx.curEnd),
  ])

  const total = parseInt(curRows[0]?.cnt, 10) || 0
  const oos = parseInt(curRows[0]?.oos_cnt, 10) || 0
  if (total === 0) return null

  const oosPct = (oos / total) * 100

  return {
    id: 'civic-parking-citations',
    headline: `${formatCount(total)} parking citations · ${oosPct.toFixed(1)}% out-of-state`,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: '/parking-citations',
      label: 'Parking Citations',
      datasetId: 'ab4h-6ztd',
    },
    sparkData: spark,
    value: formatCount(total),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: 65,
  }
}

// 8. Campaign Finance — total raised in current cycle
async function fetchCampaignFinance(ctx: QueryContext): Promise<TickerItem | null> {
  interface FinRow { total: string; filer_count: string }

  const [rows] = await Promise.all([
    fetchDataset<FinRow>('campaignFinance', {
      $select: 'sum(calculated_amount) as total, count(distinct filer_nid) as filer_count',
      $where: `form_type = 'A' AND calculated_date >= '${ctx.curStart}' AND calculated_date <= '${ctx.curEnd}'`,
      $limit: 1,
    }),
  ])

  const total = parseFloat(rows[0]?.total) || 0
  const filers = parseInt(rows[0]?.filer_count, 10) || 0
  if (total === 0) return null

  return {
    id: 'civic-campaign-finance',
    headline: `Campaign cycle: ${formatCurrency(total)} raised across ${filers} committees`,
    category: 'milestone',
    severity: 'neutral',
    source: {
      view: '/campaign-finance',
      label: 'Campaign Finance',
      datasetId: 'pitq-e56w',
    },
    value: formatCurrency(total),
    freshness: 'monthly',
    computedAt: ctx.now,
    priority: 60,
  }
}
