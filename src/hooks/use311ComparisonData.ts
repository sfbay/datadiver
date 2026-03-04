import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { Cases311Record, DailyTrendPoint } from '@/types/datasets'
import { diffHours, daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStats311 {
  avgResolution: number
  medianResolution: number
  total: number
  openCount: number
  openPct: number
}

interface Cases311ComparisonResult {
  currentStats: ComparisonStats311 | null
  comparisonStats: ComparisonStats311 | null
  deltas: { avgResolution: number; total: number; openPct: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

/** Compute resolution stats for 311 cases (requested_datetime → closed_date) */
function computeStats(records: Cases311Record[]): ComparisonStats311 {
  const times: number[] = []
  let openCount = 0
  for (const r of records) {
    if (r.status_description === 'Open') {
      openCount++
      continue
    }
    if (!r.closed_date) continue
    const t = diffHours(r.requested_datetime, r.closed_date)
    if (t !== null && t > 0 && t <= 720) times.push(t)
  }
  if (times.length === 0) return { avgResolution: 0, medianResolution: 0, total: records.length, openCount, openPct: records.length > 0 ? (openCount / records.length) * 100 : 0 }
  times.sort((a, b) => a - b)
  const avgResolution = times.reduce((a, b) => a + b, 0) / times.length
  const medianResolution = times[Math.floor(times.length / 2)]
  return { avgResolution, medianResolution, total: records.length, openCount, openPct: records.length > 0 ? (openCount / records.length) * 100 : 0 }
}

function buildTrend(records: Cases311Record[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.requested_datetime)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    const times: number[] = []
    for (const r of recs) {
      if (!r.closed_date) continue
      const t = diffHours(r.requested_datetime, r.closed_date)
      if (t !== null && t > 0 && t <= 720) times.push(t)
    }
    times.sort((a, b) => a - b)
    points.push({
      day,
      callCount: recs.length,
      avgResponseTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      medianResponseTime: times.length > 0 ? times[Math.floor(times.length / 2)] : 0,
    })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

const SELECT_FIELDS = 'service_request_id,requested_datetime,closed_date,status_description,service_name,lat,long,analysis_neighborhood,source'

/**
 * Comparison data hook for 311 Cases dataset.
 * Resolution time: requested_datetime → closed_date (in hours).
 */
export function use311ComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: Cases311Record[]
) {
  const [compRecords, setCompRecords] = useState<Cases311Record[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (comparisonDays === null) {
      setCompRecords([])
      return
    }

    let cancelled = false
    setIsLoading(true)

    const compStart = daysBeforeDate(dateRange.start, comparisonDays)
    const compEnd = daysBeforeDate(dateRange.end, comparisonDays)

    const compWhere = whereClause
      .replace(`requested_datetime >= '${dateRange.start}T00:00:00'`, `requested_datetime >= '${compStart}T00:00:00'`)
      .replace(`requested_datetime <= '${dateRange.end}T23:59:59'`, `requested_datetime <= '${compEnd}T23:59:59'`)

    fetchDataset<Cases311Record>('cases311', {
      $where: compWhere,
      $limit: 5000,
      $select: SELECT_FIELDS,
    })
      .then((data) => {
        if (!cancelled) setCompRecords(data)
      })
      .catch(() => {
        if (!cancelled) setCompRecords([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [dateRange.start, dateRange.end, whereClause, comparisonDays])

  return useMemo((): Cases311ComparisonResult => {
    if (comparisonDays === null) {
      return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
    }

    const currentStats = computeStats(currentRecords)
    const comparisonStats = computeStats(compRecords)

    const deltas = compRecords.length > 0 ? {
      avgResolution: pctDelta(currentStats.avgResolution, comparisonStats.avgResolution),
      total: pctDelta(currentStats.total, comparisonStats.total),
      openPct: pctDelta(currentStats.openPct, comparisonStats.openPct),
    } : null

    const currentTrend = buildTrend(currentRecords)
    const comparisonTrend = buildTrend(compRecords)

    return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
  }, [currentRecords, compRecords, comparisonDays, isLoading])
}
