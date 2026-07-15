import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { TrendConfig, TrendBaselineResult, PeriodDataPoint, NeighborhoodTrendStats, PeriodGranularity } from '@/types/trends'
import { yearAgo, detectGranularity } from '@/utils/time'

interface RawNhRow { neighborhood: string; cnt: string; [k: string]: string }
interface RawPeriodRow { period: string; cnt: string; [k: string]: string }
interface RawBaselineRow { neighborhood: string; month: string; cnt: string }

/**
 * Universal trend baseline hook — fires parallel Socrata queries to compute:
 * - Neighborhood YoY stats + z-scores (12-month baseline)
 * - Sub-period breakdown (daily/weekly/monthly) with prior-year ghost series
 * - City-wide YoY totals
 */
export function useTrendBaseline(
  config: TrendConfig,
  dateRange: { start: string; end: string },
  extraWhere?: string,
  /**
   * Opt-in load controls (default: eager + full).
   * - `enabled: false` defers all queries until it flips true — lets a
   *   consumer keep the fetch off the critical first-paint window without
   *   violating the rules-of-hooks (the hook is still called every render;
   *   only the effect's network work is gated).
   * - `skipPeriods: true` drops the two sub-period breakdown queries when a
   *   consumer only reads `neighborhoodMap` (e.g. useNeighborhoodProfiles),
   *   cutting 5 queries → 3 with no change to the data it actually uses.
   * - `granularity` pins the sub-period breakdown to a specific bucket
   *   (daily/weekly/monthly) instead of the auto-detected one — lets a
   *   consumer offer a manual granularity toggle (e.g. ParkingRevenue's
   *   Daily/Weekly/Monthly pills) that genuinely drives the chart.
   */
  options?: { enabled?: boolean; skipPeriods?: boolean; granularity?: PeriodGranularity }
): TrendBaselineResult {
  const enabled = options?.enabled ?? true
  const skipPeriods = options?.skipPeriods ?? false
  const [isLoading, setIsLoading] = useState(true)
  const [nhCurrent, setNhCurrent] = useState<RawNhRow[]>([])
  const [nhPriorYear, setNhPriorYear] = useState<RawNhRow[]>([])
  const [baselineRows, setBaselineRows] = useState<RawBaselineRow[]>([])
  const [periodCurrent, setPeriodCurrent] = useState<RawPeriodRow[]>([])
  const [periodPriorYear, setPeriodPriorYear] = useState<RawPeriodRow[]>([])
  const [effectiveEnd, setEffectiveEnd] = useState<string>(dateRange.end)

  const { datasetKey, dateField, neighborhoodField, metrics, baseWhere } = config
  // Day-bucketed granularities ('daily' AND 'weekly' — weekly is daily rows
  // aggregated client-side, see truncFn below) fetch one row per day via
  // queries 4/5's $limit: 500. Beyond 500 days, a pinned override would
  // silently drop the newest days (Socrata returns the earliest 500 under
  // `$order: 'period ASC'`). Ignore an unsafe override and fall back to the
  // auto-detected granularity, which never requests day-buckets past 180 days.
  const rangeDays = Math.round(
    (new Date(dateRange.end + 'T12:00:00').getTime() - new Date(dateRange.start + 'T12:00:00').getTime()) / 86_400_000
  ) + 1
  const requestedGranularity = options?.granularity
  const overrideSafe = requestedGranularity === 'monthly' || rangeDays <= 500
  const granularity = (requestedGranularity && overrideSafe ? requestedGranularity : null) ?? detectGranularity(dateRange.start, dateRange.end)
  const hasNh = !!neighborhoodField

  // Stable key for effect deps — granularity is included because it drives
  // truncFn inside the effect (the override changes what queries 4 & 5 ask
  // Socrata for, not just how the result is labeled).
  const configKey = `${datasetKey}|${dateField}|${neighborhoodField ?? ''}|${baseWhere ?? ''}|${metrics?.map(m => m.alias).join(',') ?? ''}|${granularity}`

  useEffect(() => {
    // Deferred consumer: leave isLoading at its initial `true` (the UI keeps
    // showing its skeleton) and issue no queries until `enabled` flips true.
    if (!enabled) return

    let cancelled = false
    setIsLoading(true)
    // Reset each effect run — otherwise a stale clamp from a previous
    // dataset/range leaks into truncatedDays while this run is still loading.
    setEffectiveEnd(dateRange.end)

    const run = async () => {
      // Anchor: how far does this dataset actually extend? A lagged dataset
      // (Vision Zero publishes ~4-6 weeks behind) must not have its incomplete
      // tail compared against a fully-settled prior year — that fabricates a
      // decline. Clamp the window, then shift the CLAMPED window back a year.
      let effEnd = dateRange.end
      try {
        const rows = await fetchDataset<{ latest: string }>(datasetKey, {
          $select: `MAX(${dateField}) as latest`,
          $limit: 1,
        })
        const latest = rows[0]?.latest?.split('T')[0]
        if (latest && latest < dateRange.end && latest >= dateRange.start) {
          effEnd = latest
        }
      } catch { /* anchoring is best-effort; unclamped beats no data */ }
      if (cancelled) return
      setEffectiveEnd(effEnd)

      const priStart = yearAgo(dateRange.start)
      const priEnd = yearAgo(effEnd)

      // Shared WHERE fragments
      const base = baseWhere ? ` AND ${baseWhere}` : ''
      const extra = extraWhere ? ` AND ${extraWhere}` : ''
      const metricSelect = metrics?.map(m => `, ${m.selectExpr} as ${m.alias}`).join('') ?? ''

      // Determine Socrata date_trunc function based on granularity
      const truncFn = granularity === 'monthly' ? 'date_trunc_ym' : 'date_trunc_ymd'

      const queries: Promise<void>[] = []

      // Query 1 & 2: Neighborhood current + prior year (only if hasNh)
      if (hasNh) {
        queries.push(
          fetchDataset<RawNhRow>(datasetKey, {
            $select: `${neighborhoodField} as neighborhood, count(*) as cnt${metricSelect}`,
            $where: `${dateField} >= '${dateRange.start}T00:00:00' AND ${dateField} <= '${effEnd}T23:59:59'${base}${extra}`,
            $group: neighborhoodField,
            $order: 'cnt DESC',
            $limit: 100,
          }).then(rows => { if (!cancelled) setNhCurrent(rows) })
        )

        queries.push(
          fetchDataset<RawNhRow>(datasetKey, {
            $select: `${neighborhoodField} as neighborhood, count(*) as cnt${metricSelect}`,
            $where: `${dateField} >= '${priStart}T00:00:00' AND ${dateField} <= '${priEnd}T23:59:59'${base}${extra}`,
            $group: neighborhoodField,
            $order: 'cnt DESC',
            $limit: 100,
          }).then(rows => { if (!cancelled) setNhPriorYear(rows) })
        )

        // Query 3: 12-month baseline by neighborhood × month
        const baselineStart = new Date(effEnd + 'T12:00:00')
        baselineStart.setMonth(baselineStart.getMonth() - 12)
        const baselineStartStr = baselineStart.toISOString().split('T')[0]

        queries.push(
          fetchDataset<RawBaselineRow>(datasetKey, {
            $select: `${neighborhoodField} as neighborhood, date_trunc_ym(${dateField}) as month, count(*) as cnt`,
            $where: `${dateField} >= '${baselineStartStr}T00:00:00' AND ${dateField} < '${effEnd}T23:59:59'${base}`,
            $group: `${neighborhoodField}, month`,
            $limit: 5000,
          }).then(rows => { if (!cancelled) setBaselineRows(rows) })
        )
      }

      // Queries 4 & 5: Sub-period breakdown (current + prior year).
      // Skipped when the consumer only needs neighborhood stats — these power
      // the trend charts, not the per-neighborhood map/z-score.
      if (!skipPeriods) {
        // Query 4: Sub-period breakdown (current)
        queries.push(
          fetchDataset<RawPeriodRow>(datasetKey, {
            $select: `${truncFn}(${dateField}) as period, count(*) as cnt${metricSelect}`,
            $where: `${dateField} >= '${dateRange.start}T00:00:00' AND ${dateField} <= '${effEnd}T23:59:59'${base}${extra}`,
            $group: 'period',
            $order: 'period ASC',
            $limit: 500,
          }).then(rows => { if (!cancelled) setPeriodCurrent(rows) })
        )

        // Query 5: Sub-period breakdown (prior year)
        queries.push(
          fetchDataset<RawPeriodRow>(datasetKey, {
            $select: `${truncFn}(${dateField}) as period, count(*) as cnt${metricSelect}`,
            $where: `${dateField} >= '${priStart}T00:00:00' AND ${dateField} <= '${priEnd}T23:59:59'${base}${extra}`,
            $group: 'period',
            $order: 'period ASC',
            $limit: 500,
          }).then(rows => { if (!cancelled) setPeriodPriorYear(rows) })
        )
      }

      await Promise.all(queries).catch(() => {})
      if (!cancelled) setIsLoading(false)
    }

    run()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, dateRange.start, dateRange.end, extraWhere, enabled, skipPeriods])

  // Compute neighborhood stats
  const neighborhoods = useMemo((): NeighborhoodTrendStats[] => {
    if (!hasNh || nhCurrent.length === 0) return []

    const priorMap = new Map<string, RawNhRow>()
    for (const row of nhPriorYear) priorMap.set(row.neighborhood, row)

    // Compute 12-month baseline per neighborhood (mean + stddev from monthly counts)
    const nhMonthly = new Map<string, number[]>()
    for (const row of baselineRows) {
      if (!row.neighborhood) continue
      const arr = nhMonthly.get(row.neighborhood) ?? []
      arr.push(parseInt(row.cnt, 10) || 0)
      nhMonthly.set(row.neighborhood, arr)
    }

    return nhCurrent
      .filter(row => row.neighborhood)
      .map(row => {
        const currentCount = parseInt(row.cnt, 10) || 0
        const priorRow = priorMap.get(row.neighborhood)
        const priorYearCount = priorRow ? (parseInt(priorRow.cnt, 10) || 0) : 0
        const yoyPct = priorYearCount > 0 ? ((currentCount - priorYearCount) / priorYearCount) * 100 : 0

        // Z-score from 12-month baseline
        const monthly = nhMonthly.get(row.neighborhood) ?? []
        let zScore = 0
        if (monthly.length >= 3) {
          const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length
          const variance = monthly.reduce((sum, v) => sum + (v - mean) ** 2, 0) / monthly.length
          const stdDev = Math.sqrt(variance)
          if (stdDev > 0) {
            // Normalize current count to monthly rate for comparison
            const daysInRange = (new Date(dateRange.end + 'T12:00:00').getTime() - new Date(dateRange.start + 'T12:00:00').getTime()) / 86_400_000
            const monthlyRate = currentCount * (30 / Math.max(daysInRange, 1))
            zScore = (monthlyRate - mean) / stdDev
          }
        }

        // Metric deltas
        const metricStats: Record<string, { current: number; priorYear: number; pct: number }> = {}
        if (metrics) {
          for (const m of metrics) {
            const cur = parseFloat(row[m.alias]) || 0
            const pri = priorRow ? (parseFloat(priorRow[m.alias]) || 0) : 0
            metricStats[m.alias] = { current: cur, priorYear: pri, pct: pri > 0 ? ((cur - pri) / pri) * 100 : 0 }
          }
        }

        return { neighborhood: row.neighborhood, currentCount, priorYearCount, yoyPct, zScore, metrics: metricStats }
      })
  }, [nhCurrent, nhPriorYear, baselineRows, hasNh, metrics, dateRange.start, dateRange.end])

  const neighborhoodMap = useMemo(() => {
    const map = new Map<string, NeighborhoodTrendStats>()
    for (const n of neighborhoods) map.set(n.neighborhood, n)
    return map
  }, [neighborhoods])

  // Process period data points
  const currentPeriods = useMemo(() => processPeriods(periodCurrent, granularity, metrics), [periodCurrent, granularity, metrics])
  const priorYearPeriods = useMemo(() => processPeriods(periodPriorYear, granularity, metrics), [periodPriorYear, granularity, metrics])

  // City-wide YoY
  const cityWideYoY = useMemo(() => {
    const curTotal = currentPeriods.reduce((s, p) => s + p.count, 0)
    const priTotal = priorYearPeriods.reduce((s, p) => s + p.count, 0)
    if (curTotal === 0 && priTotal === 0) return null
    const pct = priTotal > 0 ? ((curTotal - priTotal) / priTotal) * 100 : 0
    return { current: curTotal, priorYear: priTotal, pct }
  }, [currentPeriods, priorYearPeriods])

  // Calendar days trimmed off the requested end by the freshness anchor.
  const truncatedDays = Math.max(0, Math.round(
    (new Date(dateRange.end + 'T12:00:00').getTime() - new Date(effectiveEnd + 'T12:00:00').getTime()) / 86_400_000
  ))

  return { neighborhoods, neighborhoodMap, currentPeriods, priorYearPeriods, granularity, cityWideYoY, isLoading, effectiveEnd, truncatedDays }
}

/** Convert raw period rows into PeriodDataPoint[] with labels */
function processPeriods(
  rows: RawPeriodRow[],
  granularity: PeriodGranularity,
  metrics?: TrendConfig['metrics']
): PeriodDataPoint[] {
  if (rows.length === 0) return []

  // For weekly granularity, aggregate daily rows by ISO week
  if (granularity === 'weekly') {
    const weekMap = new Map<string, { count: number; metrics: Record<string, number>; firstDate: string }>()
    for (const row of rows) {
      const dateStr = row.period?.split('T')[0]
      if (!dateStr) continue
      const d = new Date(dateStr + 'T12:00:00')
      const weekStart = getISOWeekStart(d)
      const key = weekStart.toISOString().split('T')[0]
      const existing = weekMap.get(key) ?? { count: 0, metrics: {}, firstDate: key }
      existing.count += parseInt(row.cnt, 10) || 0
      if (metrics) {
        for (const m of metrics) {
          existing.metrics[m.alias] = (existing.metrics[m.alias] ?? 0) + (parseFloat(row[m.alias]) || 0)
        }
      }
      weekMap.set(key, existing)
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        period: key,
        periodLabel: formatPeriodLabel(key, 'weekly'),
        count: val.count,
        metrics: val.metrics,
      }))
  }

  return rows
    .filter(r => r.period)
    .map(row => {
      const dateStr = row.period.split('T')[0]
      const metricValues: Record<string, number> = {}
      if (metrics) {
        for (const m of metrics) {
          metricValues[m.alias] = parseFloat(row[m.alias]) || 0
        }
      }
      return {
        period: dateStr,
        periodLabel: formatPeriodLabel(dateStr, granularity),
        count: parseInt(row.cnt, 10) || 0,
        metrics: metricValues,
      }
    })
}

function formatPeriodLabel(dateStr: string, granularity: PeriodGranularity): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (granularity === 'daily') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (granularity === 'weekly') {
    return `W${getISOWeek(d)}`
  }
  // monthly
  return d.toLocaleDateString('en-US', { month: 'short' })
}

function getISOWeekStart(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const weekStart = new Date(d)
  weekStart.setDate(diff)
  return weekStart
}

function getISOWeek(d: Date): number {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
