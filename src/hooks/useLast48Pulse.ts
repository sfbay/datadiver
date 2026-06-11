/**
 * useLast48Pulse — per-stream 48h event counts for the Home page pulse card.
 *
 * Two-source strategy:
 *   1. INSTANT: seed from summaryStore (the time-shifted cache written by
 *      The Last 48 view on its last full load) — renders with zero queries
 *      for anyone who has visited the view before.
 *   2. LIVE: fire 3 cheap server-side COUNT queries (sub-second each,
 *      verified June 2026: ~3.1K 911 / ~870 Fire / ~2.6K 311) and replace
 *      the seed when they land. Module cache, 5-minute TTL.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import { useSummaryStore } from '@/stores/summaryStore'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'

export interface PulseCounts {
  counts: Record<DatasetId, number>
  total: number
  /** True once the counts come from live queries (vs the seeded cache). */
  isLive: boolean
}

interface UsePulseResult {
  data: PulseCounts | null
  isLoading: boolean
  error: string | null
}

const CACHE_TTL = 5 * 60 * 1000
let pulseCache: { data: PulseCounts; timestamp: number } | null = null

interface CountRow { cnt: string }

/** Registry key + date field per stream (mirrors useLast48Window). */
const STREAM_QUERY: Record<DatasetId, { key: string; dateField: string }> = {
  '911-realtime':      { key: 'dispatch911Realtime', dateField: 'received_datetime' },
  'fire-ems-dispatch': { key: 'fireEMSDispatch',     dateField: 'received_dttm' },
  '311-cases':         { key: 'cases311',            dateField: 'requested_datetime' },
}

async function loadLiveCounts(): Promise<PulseCounts> {
  // Socrata rejects toISOString()'s trailing .000Z — trim to seconds.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)

  const rows = await Promise.all(
    LAST48_DATASETS.map((id) => {
      const { key, dateField } = STREAM_QUERY[id]
      return fetchDataset<CountRow>(key as Parameters<typeof fetchDataset>[0], {
        $select: 'count(*) as cnt',
        $where: `${dateField} >= '${cutoff}'`,
        $limit: 1,
      }, { timeoutMs: 15_000, retries: 1 })
    }),
  )

  const counts = {} as Record<DatasetId, number>
  let total = 0
  LAST48_DATASETS.forEach((id, i) => {
    const n = parseInt(rows[i][0]?.cnt, 10) || 0
    counts[id] = n
    total += n
  })
  return { counts, total, isLive: true }
}

export function useLast48Pulse(): UsePulseResult {
  const seeded = useSummaryStore((s) => s.last48)
  const [live, setLive] = useState<PulseCounts | null>(
    pulseCache && Date.now() - pulseCache.timestamp < CACHE_TTL
      ? pulseCache.data
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false
    if (pulseCache && Date.now() - pulseCache.timestamp < CACHE_TTL) {
      setLive(pulseCache.data)
      return
    }
    loadLiveCounts()
      .then((result) => {
        if (abortRef.current) return
        pulseCache = { data: result, timestamp: Date.now() }
        setLive(result)
      })
      .catch((e) => {
        if (abortRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load pulse counts')
      })
    return () => { abortRef.current = true }
  }, [])

  // Live counts win. Otherwise fall back to the seeded cache (stale but
  // instant — "as of your last visit"). The seed only counts as data when
  // every stream contributed, so the stacked bar doesn't render lopsided
  // from a partial store.
  if (live) return { data: live, isLoading: false, error: null }

  const seedComplete = LAST48_DATASETS.every(
    (id) => typeof seeded.counts[id] === 'number',
  )
  if (seedComplete) {
    const counts = {} as Record<DatasetId, number>
    let total = 0
    for (const id of LAST48_DATASETS) {
      counts[id] = seeded.counts[id] as number
      total += counts[id]
    }
    return { data: { counts, total, isLive: false }, isLoading: false, error: null }
  }

  return { data: null, isLoading: !error, error }
}
