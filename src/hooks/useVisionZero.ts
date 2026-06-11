/**
 * useVisionZero — fatal + severe-injury crash counts for the Home page
 * Vision Zero card.
 *
 * THE DATA LAGS (~4-6 weeks; latest collision_datetime was Apr 30 when
 * "today" was Jun 10). Two consequences baked into the queries:
 *   1. The card must surface a "data through {date}" line — an empty
 *      recent window is publish lag, not safer streets.
 *   2. The YoY comparison ends BOTH windows at the data-through month/day.
 *      Comparing "2026 through April" against "2025 through June" would
 *      manufacture a fake improvement.
 *
 * Severity values on ubvf-ztfx (live-verified June 2026): 'Fatal',
 * 'Injury (Severe)', 'Injury (Other Visible)', 'Injury (Complaint of
 * Pain)'. NOTE the exact string 'Injury (Severe)' — a plausible-looking
 * 'Severe Injury' matches nothing and silently undercounts by ~90%.
 *
 * Three sequential-ish queries: MAX(date) first (defines both windows),
 * then current + prior windows in parallel. Module cache, 30-minute TTL.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'

export interface VisionZeroData {
  killed: number          // sum(number_killed), fatal+severe crashes, YTD
  severelyInjured: number // sum(number_injured) on those crashes
  crashes: number         // count of fatal + severe-injury crashes
  priorCrashes: number    // same metric, prior year, matched window
  yoyPct: number          // crashes vs prior matched window
  dataThrough: string     // ISO date of newest collision record
  year: number            // the YTD year the numbers describe
}

interface UseVisionZeroResult {
  data: VisionZeroData | null
  isLoading: boolean
  error: string | null
}

const CACHE_TTL = 30 * 60 * 1000
let vzCache: { data: VisionZeroData; timestamp: number } | null = null

interface MaxRow { latest: string }
interface StatRow { crashes: string; killed: string; injured: string }

const SEVERE_OR_FATAL =
  "(collision_severity = 'Fatal' OR collision_severity = 'Injury (Severe)')"

async function loadVisionZero(): Promise<VisionZeroData> {
  // 1. Freshness anchor — defines both comparison windows.
  const maxRows = await fetchDataset<MaxRow>('trafficCrashes', {
    $select: 'max(collision_datetime) as latest',
    $limit: 1,
  }, { timeoutMs: 15_000, retries: 1 })

  const latest = maxRows[0]?.latest
  if (!latest) throw new Error('No collision data returned')

  const dataThrough = latest.slice(0, 10)            // YYYY-MM-DD
  const year = parseInt(dataThrough.slice(0, 4), 10)
  const monthDay = dataThrough.slice(5)              // MM-DD

  const statParams = (y: number) => ({
    $select:
      'count(*) as crashes, sum(number_killed) as killed, sum(number_injured) as injured',
    $where:
      `collision_datetime >= '${y}-01-01T00:00:00' AND ` +
      `collision_datetime <= '${y}-${monthDay}T23:59:59' AND ${SEVERE_OR_FATAL}`,
    $limit: 1,
  })

  const [curRows, priRows] = await Promise.all([
    fetchDataset<StatRow>('trafficCrashes', statParams(year), { timeoutMs: 15_000, retries: 1 }),
    fetchDataset<StatRow>('trafficCrashes', statParams(year - 1), { timeoutMs: 15_000, retries: 1 }),
  ])

  const crashes = parseInt(curRows[0]?.crashes, 10) || 0
  const killed = parseInt(curRows[0]?.killed, 10) || 0
  const severelyInjured = parseInt(curRows[0]?.injured, 10) || 0
  const priorCrashes = parseInt(priRows[0]?.crashes, 10) || 0

  let yoyPct = 0
  if (priorCrashes > 0) yoyPct = ((crashes - priorCrashes) / priorCrashes) * 100
  else if (crashes > 0) yoyPct = 100

  return { killed, severelyInjured, crashes, priorCrashes, yoyPct, dataThrough, year }
}

export function useVisionZero(): UseVisionZeroResult {
  const [data, setData] = useState<VisionZeroData | null>(
    vzCache && Date.now() - vzCache.timestamp < CACHE_TTL ? vzCache.data : null,
  )
  const [isLoading, setIsLoading] = useState(data === null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    if (vzCache && Date.now() - vzCache.timestamp < CACHE_TTL) {
      setData(vzCache.data)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    loadVisionZero()
      .then((result) => {
        if (abortRef.current) return
        vzCache = { data: result, timestamp: Date.now() }
        setData(result)
        setIsLoading(false)
      })
      .catch((e) => {
        if (abortRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load Vision Zero data')
        setIsLoading(false)
      })
    return () => { abortRef.current = true }
  }, [])

  return { data, isLoading, error }
}
