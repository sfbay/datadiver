/**
 * useResponseEquity — fetches Fire/EMS dispatch response times by neighborhood
 * and computes the equity gap between best and worst-served neighborhoods.
 *
 * Fires 3 parallel Socrata queries:
 *   1. Per-neighborhood AVG response time (proxy for median)
 *   2. City-wide AVG response time
 *   3. Heatgrid: AVG response by neighborhood × call_type_group
 *
 * Module-level cache with 30-minute TTL, keyed on date range.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'

// ── Public types ────────────────────────────────────────────────

export interface NeighborhoodResponse {
  name: string
  medianSeconds: number
  medianFormatted: string // "4:12" format (minutes:seconds)
  callCount: number
}

export interface HeatgridCell {
  neighborhood: string
  callType: string
  medianSeconds: number
  medianFormatted: string
}

export interface ResponseEquityData {
  best: NeighborhoodResponse       // fastest neighborhood
  worst: NeighborhoodResponse      // slowest neighborhood
  cityAvg: NeighborhoodResponse    // city-wide average
  gapMultiplier: number            // worst / best
  heatgrid: HeatgridCell[]         // call type × neighborhood matrix
  heatgridNeighborhoods: string[]  // 5 column headers
  heatgridCallTypes: string[]      // 4 row headers (top call types by frequency)
}

export interface UseResponseEquityResult {
  data: ResponseEquityData | null
  isLoading: boolean
  error: string | null
}

// ── Module-level cache ──────────────────────────────────────────

interface CacheEntry {
  data: ResponseEquityData
  timestamp: number
  dateKey: string
}

const CACHE_TTL = 30 * 60 * 1000 // 30 minutes
let equityCache: CacheEntry | null = null

// ── Helpers ─────────────────────────────────────────────────────

/** Convert seconds to "M:SS" format (e.g. 252 → "4:12") */
function formatSeconds(s: number): string {
  const totalSec = Math.round(s)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// ── Socrata row types ───────────────────────────────────────────

interface NeighborhoodRow {
  neighborhood: string
  avg_response: string
  call_count: string
}

interface CityRow {
  avg_response: string
  call_count: string
}

interface HeatgridRow {
  neighborhood: string
  call_type: string
  avg_response: string
  call_count: string
}

// ── Query executor ──────────────────────────────────────────────

async function fetchEquityData(
  dateRange: { start: string; end: string }
): Promise<ResponseEquityData> {
  const startStr = `${dateRange.start}T00:00:00`
  const endStr = `${dateRange.end}T23:59:59`

  const baseWhere = [
    `received_dttm >= '${startStr}'`,
    `received_dttm <= '${endStr}'`,
    `on_scene_dttm IS NOT NULL`,
  ].join(' AND ')

  // 3 parallel queries
  const [nhRows, cityRows, heatRows] = await Promise.all([
    // Query 1: Per-neighborhood AVG response time
    fetchDataset<NeighborhoodRow>('fireEMSDispatch', {
      $select: [
        'neighborhoods_analysis_boundaries as neighborhood',
        'AVG(date_diff_d(on_scene_dttm, received_dttm, \'SS\')) as avg_response',
        'COUNT(*) as call_count',
      ].join(', '),
      $where: baseWhere,
      $group: 'neighborhoods_analysis_boundaries',
      $having: 'COUNT(*) > 50',
      $limit: 200,
    }),

    // Query 2: City-wide AVG response time
    fetchDataset<CityRow>('fireEMSDispatch', {
      $select: [
        'AVG(date_diff_d(on_scene_dttm, received_dttm, \'SS\')) as avg_response',
        'COUNT(*) as call_count',
      ].join(', '),
      $where: baseWhere,
      $limit: 1,
    }),

    // Query 3: Heatgrid — AVG response by neighborhood × call_type_group
    fetchDataset<HeatgridRow>('fireEMSDispatch', {
      $select: [
        'neighborhoods_analysis_boundaries as neighborhood',
        'call_type_group as call_type',
        'AVG(date_diff_d(on_scene_dttm, received_dttm, \'SS\')) as avg_response',
        'COUNT(*) as call_count',
      ].join(', '),
      $where: baseWhere,
      $group: 'neighborhoods_analysis_boundaries, call_type_group',
      $having: 'COUNT(*) > 20',
      $limit: 1000,
    }),
  ])

  // ── Process neighborhood rankings ───────────────────────────

  const validNh = nhRows
    .filter((r) => r.neighborhood && r.avg_response != null)
    .map((r) => ({
      name: r.neighborhood,
      medianSeconds: parseFloat(r.avg_response) || 0,
      callCount: parseInt(r.call_count, 10) || 0,
    }))
    .filter((r) => r.medianSeconds > 0)
    .sort((a, b) => a.medianSeconds - b.medianSeconds)

  if (validNh.length < 2) {
    throw new Error('Insufficient neighborhood data to compute equity gap')
  }

  const bestRaw = validNh[0]
  const worstRaw = validNh[validNh.length - 1]

  const best: NeighborhoodResponse = {
    name: bestRaw.name,
    medianSeconds: bestRaw.medianSeconds,
    medianFormatted: formatSeconds(bestRaw.medianSeconds),
    callCount: bestRaw.callCount,
  }

  const worst: NeighborhoodResponse = {
    name: worstRaw.name,
    medianSeconds: worstRaw.medianSeconds,
    medianFormatted: formatSeconds(worstRaw.medianSeconds),
    callCount: worstRaw.callCount,
  }

  // ── City-wide average ────────────────────────────────────────

  const cityAvgSec = parseFloat(cityRows[0]?.avg_response ?? '0') || 0
  const cityCallCount = parseInt(cityRows[0]?.call_count ?? '0', 10) || 0

  const cityAvg: NeighborhoodResponse = {
    name: 'City Average',
    medianSeconds: cityAvgSec,
    medianFormatted: formatSeconds(cityAvgSec),
    callCount: cityCallCount,
  }

  // ── Gap multiplier ───────────────────────────────────────────

  const gapMultiplier = best.medianSeconds > 0
    ? worst.medianSeconds / best.medianSeconds
    : 1

  // ── Heatgrid neighborhood selection ─────────────────────────
  // Pick 5: best, 2nd best, worst, 2nd worst, + one mid-range

  const nhCount = validNh.length
  const midIdx = Math.floor(nhCount / 2)

  const heatgridNeighborhoods: string[] = []
  const seen = new Set<string>()

  const addNh = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name)
      heatgridNeighborhoods.push(name)
    }
  }

  addNh(validNh[0].name)                  // best
  if (nhCount > 1) addNh(validNh[1].name) // 2nd best
  addNh(validNh[midIdx].name)             // mid
  if (nhCount > 2) addNh(validNh[nhCount - 2].name) // 2nd worst
  addNh(validNh[nhCount - 1].name)                  // worst

  // ── Heatgrid call type selection ─────────────────────────────
  // Top 4 call types by total call count across all neighborhoods

  const callTypeTotals = new Map<string, number>()
  for (const row of heatRows) {
    if (!row.call_type) continue
    const cnt = parseInt(row.call_count, 10) || 0
    callTypeTotals.set(row.call_type, (callTypeTotals.get(row.call_type) ?? 0) + cnt)
  }

  const heatgridCallTypes = Array.from(callTypeTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ct]) => ct)

  // ── Build heatgrid cells ─────────────────────────────────────

  const nhSet = new Set(heatgridNeighborhoods)
  const ctSet = new Set(heatgridCallTypes)

  const heatgrid: HeatgridCell[] = heatRows
    .filter((r) => r.neighborhood && r.call_type && nhSet.has(r.neighborhood) && ctSet.has(r.call_type))
    .map((r) => {
      const sec = parseFloat(r.avg_response) || 0
      return {
        neighborhood: r.neighborhood,
        callType: r.call_type,
        medianSeconds: sec,
        medianFormatted: formatSeconds(sec),
      }
    })

  return {
    best,
    worst,
    cityAvg,
    gapMultiplier,
    heatgrid,
    heatgridNeighborhoods,
    heatgridCallTypes,
  }
}

// ── Hook ────────────────────────────────────────────────────────

export function useResponseEquity(): UseResponseEquityResult {
  const dateRange = useAppStore((s) => s.dateRange)
  const [data, setData] = useState<ResponseEquityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const dateKey = `${dateRange.start}|${dateRange.end}`

    // Check module-level cache
    if (
      equityCache &&
      equityCache.dateKey === dateKey &&
      Date.now() - equityCache.timestamp < CACHE_TTL
    ) {
      setData(equityCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    fetchEquityData(dateRange)
      .then((result) => {
        if (abortRef.current) return

        // Update module-level cache
        equityCache = { data: result, timestamp: Date.now(), dateKey }

        setData(result)
        setIsLoading(false)
      })
      .catch((e) => {
        if (abortRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to fetch response equity data')
        setIsLoading(false)
      })

    return () => {
      abortRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end])

  return { data, isLoading, error }
}
