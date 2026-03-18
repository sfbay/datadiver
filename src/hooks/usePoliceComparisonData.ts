import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { PoliceIncident, DailyTrendPoint } from '@/types/datasets'
import { daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStatsPolice {
  total: number
  linkedPct: number // % with cad_number
}

interface PoliceComparisonResult {
  currentStats: ComparisonStatsPolice | null
  comparisonStats: ComparisonStatsPolice | null
  deltas: { total: number; linkedPct: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

function computeStats(records: PoliceIncident[]): ComparisonStatsPolice {
  const linkedCount = records.filter((r) => r.cad_number).length
  return {
    total: records.length,
    linkedPct: records.length > 0 ? (linkedCount / records.length) * 100 : 0,
  }
}

function buildTrend(records: PoliceIncident[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.incident_datetime)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    points.push({
      day,
      callCount: recs.length,
      avgResponseTime: 0,
      medianResponseTime: 0,
    })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

const SELECT_FIELDS = 'incident_id,incident_number,cad_number,incident_datetime,incident_category,resolution,analysis_neighborhood'

/**
 * Comparison data hook for SFPD Incidents dataset.
 * Compares current period stats vs a prior period.
 */
export function usePoliceComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: PoliceIncident[]
) {
  const [compRecords, setCompRecords] = useState<PoliceIncident[]>([])
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
      .replace(`incident_datetime >= '${dateRange.start}T00:00:00'`, `incident_datetime >= '${compStart}T00:00:00'`)
      .replace(`incident_datetime <= '${dateRange.end}T23:59:59'`, `incident_datetime <= '${compEnd}T23:59:59'`)

    fetchDataset<PoliceIncident>('policeIncidents', {
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

  return useMemo((): PoliceComparisonResult => {
    if (comparisonDays === null) {
      return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
    }

    const currentStats = computeStats(currentRecords)
    const comparisonStats = computeStats(compRecords)

    const deltas = compRecords.length > 0 ? {
      total: pctDelta(currentStats.total, comparisonStats.total),
      linkedPct: pctDelta(currentStats.linkedPct, comparisonStats.linkedPct),
    } : null

    const currentTrend = buildTrend(currentRecords)
    const comparisonTrend = buildTrend(compRecords)

    return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
  }, [currentRecords, compRecords, comparisonDays, isLoading])
}
