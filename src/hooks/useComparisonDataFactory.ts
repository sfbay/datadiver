import { useState, useEffect, useMemo } from 'react'
import { fetchDataset } from '@/api/client'
import type { DatasetKey } from '@/api/datasets'
import type {
  FireEMSDispatch,
  Cases311Record,
  DispatchCall,
  PoliceIncident,
  TrafficCrashRecord,
  ParkingCitationRecord,
  DailyTrendPoint,
} from '@/types/datasets'
import { diffMinutes, diffHours, daysBeforeDate, groupByDay } from '@/utils/time'

// ── Shared utility ────────────────────────────────────────────────

function pctDelta(current: number, comparison: number): number {
  if (comparison === 0) return 0
  return ((current - comparison) / comparison) * 100
}

// ── Generic result type ───────────────────────────────────────────

export interface ComparisonResult<TStats, TDeltas> {
  currentStats: TStats | null
  comparisonStats: TStats | null
  deltas: TDeltas | null
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}

// ── Factory config ────────────────────────────────────────────────

interface ComparisonDataConfig<TRecord, TStats, TDeltas> {
  datasetKey: DatasetKey
  dateField: string
  selectFields: string
  computeStats: (records: TRecord[]) => TStats
  computeDeltas: (current: TStats, comparison: TStats) => TDeltas
  buildTrendPoint: (day: string, recs: TRecord[]) => DailyTrendPoint
  extractDate: (r: TRecord) => string
}

/**
 * Factory that produces a dataset-specific useXxxComparisonData hook.
 * The shell logic (fetch comparison period, compute deltas, build trends)
 * is identical across all 6 datasets — only the per-dataset stats/trend
 * computation and record type differ.
 */
export function createComparisonDataHook<TRecord, TStats, TDeltas>(
  config: ComparisonDataConfig<TRecord, TStats, TDeltas>,
  name: string
) {
  const { datasetKey, dateField, selectFields, computeStats, computeDeltas, buildTrendPoint, extractDate } = config

  const hook = (
    dateRange: { start: string; end: string },
    whereClause: string,
    comparisonDays: number | null,
    currentRecords: TRecord[]
  ): ComparisonResult<TStats, TDeltas> => {
    const [compRecords, setCompRecords] = useState<TRecord[]>([])
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
        .replace(`${dateField} >= '${dateRange.start}T00:00:00'`, `${dateField} >= '${compStart}T00:00:00'`)
        .replace(`${dateField} <= '${dateRange.end}T23:59:59'`, `${dateField} <= '${compEnd}T23:59:59'`)

      fetchDataset<TRecord>(datasetKey, {
        $where: compWhere,
        $limit: 5000,
        $select: selectFields,
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

    return useMemo((): ComparisonResult<TStats, TDeltas> => {
      if (comparisonDays === null) {
        return { currentStats: null, comparisonStats: null, deltas: null, currentTrend: [], comparisonTrend: [], isLoading: false }
      }

      const currentStats = computeStats(currentRecords)
      const comparisonStats = computeStats(compRecords)

      const deltas = compRecords.length > 0 ? computeDeltas(currentStats, comparisonStats) : null

      const buildTrend = (records: TRecord[]): DailyTrendPoint[] => {
        const byDay = groupByDay(records, extractDate)
        const points: DailyTrendPoint[] = []
        for (const [day, recs] of byDay) {
          points.push(buildTrendPoint(day, recs))
        }
        return points.sort((a, b) => a.day.localeCompare(b.day))
      }

      const currentTrend = buildTrend(currentRecords)
      const comparisonTrend = buildTrend(compRecords)

      return { currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading }
    }, [currentRecords, compRecords, comparisonDays, isLoading])
  }

  Object.defineProperty(hook, 'name', { value: name })
  return hook
}

// ── Per-dataset stats interfaces ──────────────────────────────────

export interface ComparisonStats {
  avg: number
  median: number
  p90: number
  total: number
}

export interface ComparisonStats311 {
  avgResolution: number
  medianResolution: number
  total: number
  openCount: number
  openPct: number
}

export interface ComparisonStatsPolice {
  total: number
  linkedPct: number
}

export interface ComparisonStatsCrashes {
  total: number
  fatalities: number
  injuries: number
  pedBikePct: number
}

export interface ComparisonStatsCitations {
  total: number
  avgFine: number
  outOfStatePct: number
  totalFines: number
}

// ── Fire/EMS Dispatch (useComparisonData → useFireComparisonData) ─

export const useFireComparisonData = createComparisonDataHook<
  FireEMSDispatch,
  ComparisonStats,
  { avg: number; median: number; p90: number; total: number }
>(
  {
    datasetKey: 'fireEMSDispatch',
    dateField: 'received_dttm',
    selectFields: 'call_number,call_type,call_type_group,received_dttm,on_scene_dttm,neighborhoods_analysis_boundaries,supervisor_district,final_priority,case_location',
    computeStats(records) {
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
    },
    computeDeltas(current, comparison) {
      return {
        avg: pctDelta(current.avg, comparison.avg),
        median: pctDelta(current.median, comparison.median),
        p90: pctDelta(current.p90, comparison.p90),
        total: pctDelta(current.total, comparison.total),
      }
    },
    buildTrendPoint(day, recs) {
      const times: number[] = []
      for (const r of recs) {
        const t = diffMinutes(r.received_dttm, r.on_scene_dttm)
        if (t !== null && t > 0 && t <= 120) times.push(t)
      }
      if (times.length === 0) return { day, callCount: 0, avgResponseTime: 0, medianResponseTime: 0 }
      times.sort((a, b) => a - b)
      return {
        day,
        callCount: times.length,
        avgResponseTime: times.reduce((a, b) => a + b, 0) / times.length,
        medianResponseTime: times[Math.floor(times.length / 2)],
      }
    },
    extractDate: (r) => r.received_dttm,
  },
  'useFireComparisonData'
)

// ── 311 Cases ─────────────────────────────────────────────────────

export const use311ComparisonData = createComparisonDataHook<
  Cases311Record,
  ComparisonStats311,
  { avgResolution: number; total: number; openPct: number }
>(
  {
    datasetKey: 'cases311',
    dateField: 'requested_datetime',
    selectFields: 'service_request_id,requested_datetime,closed_date,status_description,service_name,lat,long,analysis_neighborhood,source',
    computeStats(records) {
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
    },
    computeDeltas(current, comparison) {
      return {
        avgResolution: pctDelta(current.avgResolution, comparison.avgResolution),
        total: pctDelta(current.total, comparison.total),
        openPct: pctDelta(current.openPct, comparison.openPct),
      }
    },
    buildTrendPoint(day, recs) {
      const times: number[] = []
      for (const r of recs) {
        if (!r.closed_date) continue
        const t = diffHours(r.requested_datetime, r.closed_date)
        if (t !== null && t > 0 && t <= 720) times.push(t)
      }
      times.sort((a, b) => a - b)
      return {
        day,
        callCount: recs.length,
        avgResponseTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        medianResponseTime: times.length > 0 ? times[Math.floor(times.length / 2)] : 0,
      }
    },
    extractDate: (r) => r.requested_datetime,
  },
  'use311ComparisonData'
)

// ── 911 Dispatch ──────────────────────────────────────────────────

export const useDispatchComparisonData = createComparisonDataHook<
  DispatchCall,
  ComparisonStats,
  { avg: number; median: number; p90: number; total: number }
>(
  {
    datasetKey: 'dispatch911Historical',
    dateField: 'received_datetime',
    selectFields: 'cad_number,received_datetime,onscene_datetime,close_datetime,call_type_final_desc,disposition,sensitive_call',
    computeStats(records) {
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
    },
    computeDeltas(current, comparison) {
      return {
        avg: pctDelta(current.avg, comparison.avg),
        median: pctDelta(current.median, comparison.median),
        p90: pctDelta(current.p90, comparison.p90),
        total: pctDelta(current.total, comparison.total),
      }
    },
    buildTrendPoint(day, recs) {
      const times: number[] = []
      for (const r of recs) {
        const end = r.onscene_datetime || r.close_datetime
        if (!end) continue
        const t = diffMinutes(r.received_datetime, end)
        if (t !== null && t > 0 && t <= 120) times.push(t)
      }
      if (times.length === 0) return { day, callCount: 0, avgResponseTime: 0, medianResponseTime: 0 }
      times.sort((a, b) => a - b)
      return {
        day,
        callCount: times.length,
        avgResponseTime: times.reduce((a, b) => a + b, 0) / times.length,
        medianResponseTime: times[Math.floor(times.length / 2)],
      }
    },
    extractDate: (r) => r.received_datetime,
  },
  'useDispatchComparisonData'
)

// ── Police Incidents ──────────────────────────────────────────────

export const usePoliceComparisonData = createComparisonDataHook<
  PoliceIncident,
  ComparisonStatsPolice,
  { total: number; linkedPct: number }
>(
  {
    datasetKey: 'policeIncidents',
    dateField: 'incident_datetime',
    selectFields: 'incident_id,incident_number,cad_number,incident_datetime,incident_category,resolution,analysis_neighborhood',
    computeStats(records) {
      const linkedCount = records.filter((r) => r.cad_number).length
      return {
        total: records.length,
        linkedPct: records.length > 0 ? (linkedCount / records.length) * 100 : 0,
      }
    },
    computeDeltas(current, comparison) {
      return {
        total: pctDelta(current.total, comparison.total),
        linkedPct: pctDelta(current.linkedPct, comparison.linkedPct),
      }
    },
    buildTrendPoint(day, recs) {
      return {
        day,
        callCount: recs.length,
        avgResponseTime: 0,
        medianResponseTime: 0,
      }
    },
    extractDate: (r) => r.incident_datetime,
  },
  'usePoliceComparisonData'
)

// ── Traffic Crashes ───────────────────────────────────────────────

export const useCrashComparisonData = createComparisonDataHook<
  TrafficCrashRecord,
  ComparisonStatsCrashes,
  { total: number; injuries: number; pedBikePct: number }
>(
  {
    datasetKey: 'trafficCrashes',
    dateField: 'collision_datetime',
    selectFields: 'unique_id,collision_datetime,collision_severity,dph_col_grp_description,number_killed,number_injured,primary_rd,secondary_rd,analysis_neighborhood,tb_latitude,tb_longitude,point',
    computeStats(records) {
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
    },
    computeDeltas(current, comparison) {
      return {
        total: pctDelta(current.total, comparison.total),
        injuries: pctDelta(current.injuries, comparison.injuries),
        pedBikePct: pctDelta(current.pedBikePct, comparison.pedBikePct),
      }
    },
    buildTrendPoint(day, recs) {
      let totalInjured = 0
      for (const r of recs) {
        totalInjured += parseInt(r.number_injured, 10) || 0
      }
      return {
        day,
        callCount: recs.length,
        avgResponseTime: recs.length > 0 ? totalInjured / recs.length : 0,
        medianResponseTime: 0,
      }
    },
    extractDate: (r) => r.collision_datetime,
  },
  'useCrashComparisonData'
)

// ── Parking Citations ─────────────────────────────────────────────

export const useCitationComparisonData = createComparisonDataHook<
  ParkingCitationRecord,
  ComparisonStatsCitations,
  { total: number; avgFine: number; outOfStatePct: number }
>(
  {
    datasetKey: 'parkingCitations',
    dateField: 'citation_issued_datetime',
    selectFields: 'citation_number,citation_issued_datetime,violation_desc,fine_amount,vehicle_plate_state,the_geom,analysis_neighborhood',
    computeStats(records) {
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
    },
    computeDeltas(current, comparison) {
      return {
        total: pctDelta(current.total, comparison.total),
        avgFine: pctDelta(current.avgFine, comparison.avgFine),
        outOfStatePct: pctDelta(current.outOfStatePct, comparison.outOfStatePct),
      }
    },
    buildTrendPoint(day, recs) {
      let totalFines = 0
      for (const r of recs) {
        const f = parseFloat(r.fine_amount)
        if (!isNaN(f)) totalFines += f
      }
      return {
        day,
        callCount: recs.length,
        avgResponseTime: recs.length > 0 ? totalFines / recs.length : 0,
        medianResponseTime: 0,
      }
    },
    extractDate: (r) => r.citation_issued_datetime,
  },
  'useCitationComparisonData'
)
