import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { DispatchCall, DailyTrendPoint } from '@/types/datasets'
import { diffMinutes, daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStats {
  avg: number
  median: number
  p90: number
  total: number
}

interface DispatchComparisonResult {
  currentStats: ComparisonStats | null
  comparisonStats: ComparisonStats | null
  deltas: { avg: number; median: number; p90: number; total: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

/** Compute response time stats for dispatch calls (received_datetime → onscene_datetime) */
function computeStats(records: DispatchCall[]): ComparisonStats {
  const times: number[] = []
  for (const r of records) {
    // Primary: received → on-scene. Fallback: received → close.
    const end = r.onscene_datetime || r.close_datetime
    if (!end) continue
    const t = diffMinutes(r.received_datetime, end)
    if (t !== null && t > 0 && t <= 120) times.push(t)
  }
  if (times.length === 0) return { avg: 0, median: 0, p90: 0, total: 0 }
  times.sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const median = times[Math.floor(times.length / 2)]
  const p90 = times[Math.floor(times.length * 0.9)]
  return { avg, median, p90, total: times.length }
}

function buildTrend(records: DispatchCall[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.received_datetime)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    const times: number[] = []
    for (const r of recs) {
      const end = r.onscene_datetime || r.close_datetime
      if (!end) continue
      const t = diffMinutes(r.received_datetime, end)
      if (t !== null && t > 0 && t <= 120) times.push(t)
    }
    if (times.length === 0) continue
    times.sort((a, b) => a - b)
    points.push({
      day,
      callCount: times.length,
      avgResponseTime: times.reduce((a, b) => a + b, 0) / times.length,
      medianResponseTime: times[Math.floor(times.length / 2)],
    })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

const SELECT_FIELDS = 'cad_number,received_datetime,onscene_datetime,close_datetime,call_type_final_desc,disposition,sensitive_call'

/**
 * Comparison data hook for 911 dispatch dataset.
 * Same pattern as useComparisonData but uses dispatch911Historical + received_datetime.
 */
export function useDispatchComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: DispatchCall[]
) {
  const [compRecords, setCompRecords] = useState<DispatchCall[]>([])
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
      .replace(`received_datetime >= '${dateRange.start}T00:00:00'`, `received_datetime >= '${compStart}T00:00:00'`)
      .replace(`received_datetime <= '${dateRange.end}T23:59:59'`, `received_datetime <= '${compEnd}T23:59:59'`)

    fetchDataset<DispatchCall>('dispatch911Historical', {
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

  return useMemo((): DispatchComparisonResult => {
    if (comparisonDays === null) {
      return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
    }

    const currentStats = computeStats(currentRecords)
    const comparisonStats = computeStats(compRecords)

    const deltas = compRecords.length > 0 ? {
      avg: pctDelta(currentStats.avg, comparisonStats.avg),
      median: pctDelta(currentStats.median, comparisonStats.median),
      p90: pctDelta(currentStats.p90, comparisonStats.p90),
      total: pctDelta(currentStats.total, comparisonStats.total),
    } : null

    const currentTrend = buildTrend(currentRecords)
    const comparisonTrend = buildTrend(compRecords)

    return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
  }, [currentRecords, compRecords, comparisonDays, isLoading])
}
