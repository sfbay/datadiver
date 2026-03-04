import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { FireEMSDispatch } from '@/types/datasets'
import type { DailyTrendPoint } from '@/types/datasets'
import { diffMinutes, daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStats {
  avg: number
  median: number
  p90: number
  total: number
}

interface ComparisonResult {
  currentStats: ComparisonStats | null
  comparisonStats: ComparisonStats | null
  deltas: { avg: number; median: number; p90: number; total: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

function computeStats(records: FireEMSDispatch[]): ComparisonStats {
  const times: number[] = []
  for (const r of records) {
    const t = diffMinutes(r.received_dttm, r.on_scene_dttm)
    if (t !== null && t > 0 && t <= 120) times.push(t)
  }
  if (times.length === 0) return { avg: 0, median: 0, p90: 0, total: 0 }
  times.sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const median = times[Math.floor(times.length / 2)]
  const p90 = times[Math.floor(times.length * 0.9)]
  return { avg, median, p90, total: times.length }
}

function buildTrend(records: FireEMSDispatch[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.received_dttm)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    const times: number[] = []
    for (const r of recs) {
      const t = diffMinutes(r.received_dttm, r.on_scene_dttm)
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

/**
 * Fetches data for a comparison period and computes stats/deltas.
 * Only active when comparisonDays is not null.
 */
export function useComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: FireEMSDispatch[]
) {
  const [compRecords, setCompRecords] = useState<FireEMSDispatch[]>([])
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

    // Replace the date range in whereClause with the comparison range
    const compWhere = whereClause
      .replace(`received_dttm >= '${dateRange.start}T00:00:00'`, `received_dttm >= '${compStart}T00:00:00'`)
      .replace(`received_dttm <= '${dateRange.end}T23:59:59'`, `received_dttm <= '${compEnd}T23:59:59'`)

    fetchDataset<FireEMSDispatch>('fireEMSDispatch', {
      $where: compWhere,
      $limit: 5000,
      $select: 'call_number,call_type,call_type_group,received_dttm,on_scene_dttm,neighborhoods_analysis_boundaries,supervisor_district,final_priority,case_location',
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

  return useMemo((): ComparisonResult => {
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
