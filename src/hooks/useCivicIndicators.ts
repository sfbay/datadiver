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
import { sfLocalCutoff } from '@/utils/sfTime'
import { classifyCallType } from '@/lib/alerts/significance'
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
    fetchSignificantTally(ctx),    // fresh Last-48 observation (48h significant incidents)
    fetch311CategorySurge(ctx),    // fastest-rising 311 complaint type
    fetchEmergencyResponse(ctx),
    fetch311Cases(ctx),
    fetchCrimeIncidents(ctx),
    fetchParkingRevenue(ctx),
    fetchParkingCitations(ctx),
    fetchCampaignFinance(ctx),
    // Dropped: Traffic Safety (current period reads -100% from the 4-6 week
    // crash-reporting lag — the 60-day freshness gate is too coarse to catch
    // an empty *current* window) and Net Business Formation (NAICS
    // openings/closures coding bias makes "net" systematically misleading —
    // see docs/data-insights.md).
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

// 9. Significant-incident tally — the freshest, most editorial ticker item: a
//    live count of serious 911 + Fire/EMS calls in the last 48h, classified
//    with the SAME matcher the alert digests use (classifyCallType). Two cheap
//    GROUP BYs (one per stream), no full event load, so it stays light on
//    Home's critical path. Fixed 48h window, not the global date range.
async function fetchSignificantTally(ctx: QueryContext): Promise<TickerItem | null> {
  // SF wall-clock digits — DataSF datetimes are floating local, so UTC digits
  // (toISOString) undercount the 48h tally by 7–8h. See src/utils/sfTime.ts.
  const cutoff = sfLocalCutoff(ctx.now.getTime() - 48 * 3600_000)
  interface TypeRow { t: string; cnt: string }

  const [calls911, fireEms] = await Promise.all([
    fetchDataset<TypeRow>('dispatch911Realtime', {
      $select: 'call_type_final_desc as t, count(*) as cnt',
      $where: `received_datetime >= '${cutoff}'`,
      $group: 'call_type_final_desc',
      $limit: 500,
    }),
    fetchDataset<TypeRow>('fireEMSDispatch', {
      $select: 'call_type as t, count(*) as cnt',
      $where: `received_dttm >= '${cutoff}'`,
      $group: 'call_type',
      $limit: 500,
    }),
  ])

  // Sum grouped call-type counts into significant categories (robberies,
  // shootings, fires, …); non-significant types classify to null and drop.
  const tally = new Map<string, number>() // category plural -> count
  for (const r of [...calls911, ...fireEms]) {
    const cat = classifyCallType(r.t ?? '')
    if (!cat) continue
    tally.set(cat.plural, (tally.get(cat.plural) ?? 0) + (parseInt(r.cnt, 10) || 0))
  }

  const ranked = [...tally.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null

  const total = ranked.reduce((s, [, n]) => s + n, 0)
  const phrase = ranked.slice(0, 3).map(([plural, n]) => `${n} ${plural}`).join(' · ')

  return {
    id: 'civic-significant-tally',
    headline: `${phrase} across SF`,
    detail: 'Significant incidents reported in the last 48 hours',
    category: 'anomaly',
    severity: 'alert',
    source: { view: '/live', label: 'The Last 48' },
    value: formatCount(total),
    freshness: 'live',
    computedAt: ctx.now,
    priority: 92, // fresh + serious -> near the top of the ticker
  }
}

// 10. Surging 311 category — which complaint type is rising fastest YoY. A
//     different lens than the neighborhood anomaly above; two cheap GROUP BYs
//     (current vs prior-year period by service name).
async function fetch311CategorySurge(ctx: QueryContext): Promise<TickerItem | null> {
  interface CatRow { cat: string; cnt: string }

  const [cur, pri] = await Promise.all([
    fetchDataset<CatRow>('cases311', {
      $select: 'service_name as cat, count(*) as cnt',
      $where: `requested_datetime >= '${ctx.curStart}' AND requested_datetime <= '${ctx.curEnd}'`,
      $group: 'service_name',
      $order: 'cnt DESC',
      $limit: 100,
    }),
    fetchDataset<CatRow>('cases311', {
      $select: 'service_name as cat, count(*) as cnt',
      $where: `requested_datetime >= '${ctx.priStart}' AND requested_datetime <= '${ctx.priEnd}'`,
      $group: 'service_name',
      $limit: 200,
    }),
  ])

  const priorMap = new Map(pri.map((r) => [r.cat, parseInt(r.cnt, 10) || 0]))
  let top: { cat: string; cur: number; pct: number } | null = null
  for (const r of cur) {
    if (!r.cat) continue
    const c = parseInt(r.cnt, 10) || 0
    const p = priorMap.get(r.cat) ?? 0
    if (c < 50 || p < 20) continue // skip thin/noisy categories
    const pct = pctDelta(c, p)
    if (pct > 25 && (!top || pct > top.pct)) top = { cat: r.cat, cur: c, pct }
  }
  if (!top) return null

  return {
    id: 'civic-311-category-surge',
    headline: `311: ${top.cat} up ${formatPct(top.pct)} vs last year`,
    detail: `${formatCount(top.cur)} cases this period`,
    category: 'anomaly',
    severity: 'negative',
    source: { view: '/311-cases', label: `311 Cases · ${top.cat}`, datasetId: 'vw6y-z8j6' },
    delta: top.pct,
    value: formatCount(top.cur),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: 82,
  }
}
