/**
 * useDispatchUnanswered — fetches 911 dispatch calls that exceeded the
 * 10-minute response target (response > 10 min OR no on_scene timestamp).
 *
 * Fires 4 parallel Socrata queries:
 *   1. Current period slow-call count
 *   2. Prior year slow-call count (for YoY delta)
 *   3. Hourly distribution of slow calls (24 buckets)
 *   4. Disposition breakdown of slow calls (top 10, bucketed)
 *
 * Module-level cache with 30-minute TTL, keyed on date range.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useAppStore } from '@/stores/appStore'
import { yearAgo } from '@/utils/time'

// ── Types ───────────────────────────────────────────────────────

export interface UnansweredData {
  totalExceeded: number            // calls where response > 10 min or no on_scene
  priorYearTotal: number           // same metric for prior year period
  yoyPct: number                   // percentage change vs last year
  hourlyDistribution: number[]     // 24 entries, index 0 = midnight
  outcomes: Array<{ label: string; count: number; pct: number }>
}

export interface UseDispatchUnansweredResult {
  data: UnansweredData | null
  isLoading: boolean
  error: string | null
}

// ── Module-level cache ──────────────────────────────────────────

interface CacheEntry {
  data: UnansweredData
  timestamp: number
  dateKey: string
}

const CACHE_TTL = 30 * 60 * 1000  // 30 minutes
let unansweredCache: CacheEntry | null = null

// ── Row types for Socrata responses ────────────────────────────

interface CountRow { cnt: string }
interface HourRow { hour: string; cnt: string }
interface DispositionRow { final_disposition: string; cnt: string }

// ── Outcome bucket mapping ──────────────────────────────────────

function mapDispositionLabel(disposition: string | null | undefined): string {
  if (!disposition) return 'Late arrival'
  const upper = disposition.toUpperCase()
  if (upper.includes('CANCEL') || upper.includes('CAN')) return 'Cancelled'
  if (upper.includes('NO MERIT') || upper.includes('GOA') || upper.includes('GONE ON ARRIVAL')) {
    return 'No one there'
  }
  return 'Late arrival'
}

// ── Core data loader ────────────────────────────────────────────

async function loadUnansweredData(dateRange: {
  start: string
  end: string
}): Promise<UnansweredData> {
  const curStart = `${dateRange.start}T00:00:00`
  const curEnd = `${dateRange.end}T23:59:59`
  const priStart = `${yearAgo(dateRange.start)}T00:00:00`
  const priEnd = `${yearAgo(dateRange.end)}T23:59:59`

  // "Slow" call predicate: no on_scene timestamp OR response > 10 minutes.
  //
  // Socrata has retired the `date_diff_mm` / `date_diff_ss` arity-2 functions
  // on this dataset's query engine (rejects with `query.soql.no-such-function`).
  // Compute response seconds via component decomposition — extract hh+mm+ss
  // from each timestamp and subtract — same pattern as `useResponseEquity`.
  //
  // The SAME_DAY guard drops <0.5% of calls that roll across midnight, in
  // exchange for keeping the arithmetic positive (without it, a call received
  // at 23:55 and resolved at 00:05 would compute as a negative 86,400-second
  // diff and never trigger the > 600 threshold).
  const SAME_DAY = (
    '(date_extract_y(on_scene_dttm) = date_extract_y(received_dttm) AND ' +
    'date_extract_m(on_scene_dttm) = date_extract_m(received_dttm) AND ' +
    'date_extract_d(on_scene_dttm) = date_extract_d(received_dttm))'
  )
  const RESPONSE_SECONDS = (
    '((date_extract_hh(on_scene_dttm) - date_extract_hh(received_dttm)) * 3600 + ' +
    '(date_extract_mm(on_scene_dttm) - date_extract_mm(received_dttm)) * 60 + ' +
    '(date_extract_ss(on_scene_dttm) - date_extract_ss(received_dttm)))'
  )
  const slowPredicate = `(on_scene_dttm IS NULL OR (${SAME_DAY} AND ${RESPONSE_SECONDS} > 600))`

  const curWhere = `received_dttm >= '${curStart}' AND received_dttm <= '${curEnd}' AND ${slowPredicate}`
  const priWhere = `received_dttm >= '${priStart}' AND received_dttm <= '${priEnd}' AND ${slowPredicate}`

  const [countRows, priorRows, hourRows, dispositionRows] = await Promise.all([
    // 1. Current period slow-call count
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'COUNT(*) as cnt',
      $where: curWhere,
      $limit: 1,
    }),
    // 2. Prior year slow-call count
    fetchDataset<CountRow>('fireEMSDispatch', {
      $select: 'COUNT(*) as cnt',
      $where: priWhere,
      $limit: 1,
    }),
    // 3. Hourly distribution of slow calls
    fetchDataset<HourRow>('fireEMSDispatch', {
      $select: `date_extract_hh(received_dttm) as hour, COUNT(*) as cnt`,
      $where: curWhere,
      $group: 'hour',
      $order: 'hour ASC',
      $limit: 24,
    }),
    // 4. Disposition breakdown of slow calls (top 10)
    fetchDataset<DispositionRow>('fireEMSDispatch', {
      $select: 'final_disposition, COUNT(*) as cnt',
      $where: curWhere,
      $group: 'final_disposition',
      $order: 'cnt DESC',
      $limit: 10,
    }),
  ])

  // ── Count + YoY ──────────────────────────────────────────────
  const totalExceeded = parseInt(countRows[0]?.cnt, 10) || 0
  const priorYearTotal = parseInt(priorRows[0]?.cnt, 10) || 0
  let yoyPct = 0
  if (priorYearTotal > 0) {
    yoyPct = ((totalExceeded - priorYearTotal) / priorYearTotal) * 100
  } else if (totalExceeded > 0) {
    yoyPct = 100
  }

  // ── Hourly distribution (24 buckets, fill gaps with 0) ──────
  const hourlyDistribution = Array<number>(24).fill(0)
  for (const row of hourRows) {
    const h = parseInt(row.hour, 10)
    if (h >= 0 && h < 24) {
      hourlyDistribution[h] = parseInt(row.cnt, 10) || 0
    }
  }

  // ── Outcome bucketing ────────────────────────────────────────
  const bucketMap = new Map<string, number>()
  for (const row of dispositionRows) {
    const label = mapDispositionLabel(row.final_disposition)
    bucketMap.set(label, (bucketMap.get(label) ?? 0) + (parseInt(row.cnt, 10) || 0))
  }

  const bucketTotal = Array.from(bucketMap.values()).reduce((s, n) => s + n, 0)
  const outcomes = Array.from(bucketMap.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: bucketTotal > 0 ? (count / bucketTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return { totalExceeded, priorYearTotal, yoyPct, hourlyDistribution, outcomes }
}

// ── Hook ────────────────────────────────────────────────────────

export function useDispatchUnanswered(): UseDispatchUnansweredResult {
  const dateRange = useAppStore((s) => s.dateRange)
  const [data, setData] = useState<UnansweredData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    const dateKey = `${dateRange.start}|${dateRange.end}`

    // Check module-level cache
    if (
      unansweredCache &&
      unansweredCache.dateKey === dateKey &&
      Date.now() - unansweredCache.timestamp < CACHE_TTL
    ) {
      setData(unansweredCache.data)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    loadUnansweredData(dateRange).then((result) => {
      if (abortRef.current) return
      unansweredCache = { data: result, timestamp: Date.now(), dateKey }
      setData(result)
      setIsLoading(false)
    }).catch((e) => {
      if (abortRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load dispatch unanswered data')
      setIsLoading(false)
    })

    return () => { abortRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end])

  return { data, isLoading, error }
}
