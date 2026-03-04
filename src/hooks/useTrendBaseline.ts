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
  extraWhere?: string
): TrendBaselineResult {
  const [isLoading, setIsLoading] = useState(true)
  const [nhCurrent, setNhCurrent] = useState<RawNhRow[]>([])
  const [nhPriorYear, setNhPriorYear] = useState<RawNhRow[]>([])
  const [baselineRows, setBaselineRows] = useState<RawBaselineRow[]>([])
  const [periodCurrent, setPeriodCurrent] = useState<RawPeriodRow[]>([])
  const [periodPriorYear, setPeriodPriorYear] = useState<RawPeriodRow[]>([])

  const { datasetKey, dateField, neighborhoodField, metrics, baseWhere } = config
  const granularity = detectGranularity(dateRange.start, dateRange.end)
  const hasNh = !!neighborhoodField

  // Stable key for effect deps
  const configKey = `${datasetKey}|${dateField}|${neighborhoodField ?? ''}|${baseWhere ?? ''}|${metrics?.map(m => m.alias).join(',') ?? ''}`

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const priStart = yearAgo(dateRange.start)
    const priEnd = yearAgo(dateRange.end)

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
          $where: `${dateField} >= '${dateRange.start}T00:00:00' AND ${dateField} <= '${dateRange.end}T23:59:59'${base}${extra}`,
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
      const baselineStart = new Date(dateRange.end + 'T12:00:00')
      baselineStart.setMonth(baselineStart.getMonth() - 12)
      const baselineStartStr = baselineStart.toISOString().split('T')[0]

      queries.push(
        fetchDataset<RawBaselineRow>(datasetKey, {
          $select: `${neighborhoodField} as neighborhood, date_trunc_ym(${dateField}) as month, count(*) as cnt`,
          $where: `${dateField} >= '${baselineStartStr}T00:00:00' AND ${dateField} < '${dateRange.end}T23:59:59'${base}`,
          $group: `${neighborhoodField}, month`,
          $limit: 5000,
        }).then(rows => { if (!cancelled) setBaselineRows(rows) })
      )
    }

    // Query 4: Sub-period breakdown (current)
    queries.push(
      fetchDataset<RawPeriodRow>(datasetKey, {
        $select: `${truncFn}(${dateField}) as period, count(*) as cnt${metricSelect}`,
        $where: `${dateField} >= '${dateRange.start}T00:00:00' AND ${dateField} <= '${dateRange.end}T23:59:59'${base}${extra}`,
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

    Promise.all(queries)
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, dateRange.start, dateRange.end, extraWhere])

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

  return { neighborhoods, neighborhoodMap, currentPeriods, priorYearPeriods, granularity, cityWideYoY, isLoading }
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
