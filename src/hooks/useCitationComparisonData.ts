import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { ParkingCitationRecord, DailyTrendPoint } from '@/types/datasets'
import { daysBeforeDate, groupByDay } from '@/utils/time'

interface ComparisonStatsCitations {
  total: number
  avgFine: number
  outOfStatePct: number
  totalFines: number
}

interface CitationComparisonResult {
  currentStats: ComparisonStatsCitations | null
  comparisonStats: ComparisonStatsCitations | null
  deltas: { total: number; avgFine: number; outOfStatePct: number } | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

function computeStats(records: ParkingCitationRecord[]): ComparisonStatsCitations {
  let totalFines = 0
  let outOfState = 0
  let fineCount = 0
  for (const r of records) {
    const fine = parseFloat(r.fine_amount)
    if (!isNaN(fine) && fine > 0) {
      totalFines += fine
      fineCount++
    }
    if (r.vehicle_plate_state && r.vehicle_plate_state !== 'CA') {
      outOfState++
    }
  }
  return {
    total: records.length,
    avgFine: fineCount > 0 ? totalFines / fineCount : 0,
    outOfStatePct: records.length > 0 ? (outOfState / records.length) * 100 : 0,
    totalFines,
  }
}

function buildTrend(records: ParkingCitationRecord[]): DailyTrendPoint[] {
  const byDay = groupByDay(records, (r) => r.citation_issued_datetime)
  const points: DailyTrendPoint[] = []
  for (const [day, recs] of byDay) {
    let totalFines = 0
    for (const r of recs) {
      const f = parseFloat(r.fine_amount)
      if (!isNaN(f)) totalFines += f
    }
    points.push({
      day,
      callCount: recs.length,
      avgResponseTime: recs.length > 0 ? totalFines / recs.length : 0,
      medianResponseTime: 0,
    })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

const SELECT_FIELDS = 'citation_number,citation_issued_datetime,violation_desc,fine_amount,vehicle_plate_state,the_geom,analysis_neighborhood'

export function useCitationComparisonData(
  dateRange: { start: string; end: string },
  whereClause: string,
  comparisonDays: number | null,
  currentRecords: ParkingCitationRecord[]
) {
  const [compRecords, setCompRecords] = useState<ParkingCitationRecord[]>([])
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
      .replace(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`, `citation_issued_datetime >= '${compStart}T00:00:00'`)
      .replace(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`, `citation_issued_datetime <= '${compEnd}T23:59:59'`)

    fetchDataset<ParkingCitationRecord>('parkingCitations', {
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

  return useMemo((): CitationComparisonResult => {
    if (comparisonDays === null) {
      return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
    }

    const currentStats = computeStats(currentRecords)
    const comparisonStats = computeStats(compRecords)

    const deltas = compRecords.length > 0 ? {
      total: pctDelta(currentStats.total, comparisonStats.total),
      avgFine: pctDelta(currentStats.avgFine, comparisonStats.avgFine),
      outOfStatePct: pctDelta(currentStats.outOfStatePct, comparisonStats.outOfStatePct),
    } : null

    const currentTrend = buildTrend(currentRecords)
    const comparisonTrend = buildTrend(compRecords)

    return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
  }, [currentRecords, compRecords, comparisonDays, isLoading])
}
