import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { TrafficCrashRecord, DailyTrendPoint } from '@/types/datasets'
import { daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStatsCrashes {
  total: number
  fatalities: number
  injuries: number
  pedBikePct: number
}

interface CrashComparisonResult {
  currentStats: ComparisonStatsCrashes | null
  comparisonStats: ComparisonStatsCrashes | null
  deltas: { total: number; injuries: number; pedBikePct: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

function computeStats(records: TrafficCrashRecord[]): ComparisonStatsCrashes {
  let fatalities = 0
  let injuries = 0
  let pedBike = 0
  for (const r of records) {
    fatalities += parseInt(r.number_killed, 10) || 0
    injuries += parseInt(r.number_injured, 10) || 0
    const mode = r.dph_col_grp_description || ''
    if (mode.includes('Ped') || mode.includes('Bike')) pedBike++
  }
  return {
    total: records.length,
    fatalities,
    injuries,
    pedBikePct: records.length > 0 ? (pedBike / records.length) * 100 : 0,
  }
}

function buildTrend(records: TrafficCrashRecord[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.collision_datetime)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    let totalInjured = 0
    for (const r of recs) {
      totalInjured += parseInt(r.number_injured, 10) || 0
    }
    points.push({
      day,
      callCount: recs.length,
      avgResponseTime: recs.length > 0 ? totalInjured / recs.length : 0,
      medianResponseTime: 0,
    })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

const SELECT_FIELDS = 'unique_id,collision_datetime,collision_severity,dph_col_grp_description,number_killed,number_injured,primary_rd,secondary_rd,analysis_neighborhood,tb_latitude,tb_longitude,point'

export function useCrashComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: TrafficCrashRecord[]
) {
  const [compRecords, setCompRecords] = useState<TrafficCrashRecord[]>([])
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
      .replace(`collision_datetime >= '${dateRange.start}T00:00:00'`, `collision_datetime >= '${compStart}T00:00:00'`)
      .replace(`collision_datetime <= '${dateRange.end}T23:59:59'`, `collision_datetime <= '${compEnd}T23:59:59'`)

    fetchDataset<TrafficCrashRecord>('trafficCrashes', {
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

  return useMemo((): CrashComparisonResult => {
    if (comparisonDays === null) {
      return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
    }

    const currentStats = computeStats(currentRecords)
    const comparisonStats = computeStats(compRecords)

    const deltas = compRecords.length > 0 ? {
      total: pctDelta(currentStats.total, comparisonStats.total),
      injuries: pctDelta(currentStats.injuries, comparisonStats.injuries),
      pedBikePct: pctDelta(currentStats.pedBikePct, comparisonStats.pedBikePct),
    } : null

    const currentTrend = buildTrend(currentRecords)
    const comparisonTrend = buildTrend(compRecords)

    return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
  }, [currentRecords, compRecords, comparisonDays, isLoading])
}
