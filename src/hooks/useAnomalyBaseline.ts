// src/hooks/useAnomalyBaseline.ts
//
// Computes per-(neighborhood × dataset) z-scores for HOTSPOTS mode.
//
// Baseline window: 12 weeks of non-overlapping 48h windows = 42 samples
// per (neighborhood, dataset). Fetched server-side via a single Socrata
// query per dataset that GROUP BY neighborhood and bucket events into
// 48h windows.
//
// Cached for the session — refreshes only when the hook is first
// instantiated (HOTSPOTS mode entry). Re-entry uses cache.

import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  AnomalyResult,
  DatasetId,
  NormalizedEvent,
} from '@/types/last48'

interface BaselineEntry {
  // Per-neighborhood: array of historical 48h counts
  historicalCounts: Record<string, number[]>
}

interface CacheValue {
  baseline: Record<DatasetId, BaselineEntry>
  fetchedAt: number
}

const CACHE_TTL = 4 * 60 * 60 * 1000  // 4h — baseline shifts slowly

// Keyed by the sorted dataset list — two consumers with different `datasets`
// args must not overwrite each other's cache entry. `inflight` single-flights
// concurrent cold-loads of the same key (Last48.tsx and Last48UnifiedView.tsx
// both call this hook; without it, every cold entry double-fetched the same
// three Socrata baseline queries).
const cache = new Map<string, CacheValue>()
const inflight = new Map<string, Promise<Record<DatasetId, BaselineEntry>>>()

function loadBaseline(key: string, datasets: DatasetId[]): Promise<Record<DatasetId, BaselineEntry>> {
  const existing = inflight.get(key)
  if (existing) return existing
  const p = Promise.all(
    datasets.map((id) => fetchBaselineForDataset(id).then((b) => [id, b] as const))
  )
    .then((entries) => {
      const b = {} as Record<DatasetId, BaselineEntry>
      for (const [id, entry] of entries) b[id] = entry
      cache.set(key, { baseline: b, fetchedAt: Date.now() })
      return b
    })
    .finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

// Same mappings as useLast48Window (verified against src/api/datasets.ts).
const DATASET_REGISTRY_KEY: Record<DatasetId, string> = {
  '911-realtime':       'dispatch911Realtime',
  'fire-ems-dispatch':  'fireEMSDispatch',
  '311-cases':          'cases311',
}
const DATE_FIELD: Record<DatasetId, string> = {
  '911-realtime':       'received_datetime',
  'fire-ems-dispatch':  'received_dttm',
  '311-cases':          'requested_datetime',
}
const NEIGHBORHOOD_FIELD: Record<DatasetId, string> = {
  '911-realtime':       'analysis_neighborhood',
  'fire-ems-dispatch':  'neighborhoods_analysis_boundaries',
  '311-cases':          'neighborhoods_sffind_boundaries',
}

interface BaselineRow {
  neighborhood: string
  window_start: string  // a daily-truncated timestamp
  cnt: string
}

async function fetchBaselineForDataset(datasetId: DatasetId): Promise<BaselineEntry> {
  const dateField = DATE_FIELD[datasetId]
  const nhField = NEIGHBORHOOD_FIELD[datasetId]
  const registryKey = DATASET_REGISTRY_KEY[datasetId]

  // 84 days = 12 weeks. CRITICAL: trim the .000Z from toISOString — Socrata
  // rejects that form as a text literal (same bug we fixed in Phase 1's
  // useLast48Window). Use slice(0, 19) for YYYY-MM-DDTHH:MM:SS.
  const since = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  const rows = await fetchDataset<BaselineRow>(
    // DatasetKey is just a string alias — cast is safe since all
    // DATASET_REGISTRY_KEY values are valid keys in src/api/datasets.ts
    registryKey as Parameters<typeof fetchDataset>[0],
    {
      $select: `${nhField} as neighborhood, date_trunc_ymd(${dateField}) as window_start, COUNT(*) as cnt`,
      $where: `${dateField} >= '${since}' AND ${nhField} IS NOT NULL`,
      $group: `${nhField}, date_trunc_ymd(${dateField})`,
      $limit: 50000,
    },
    { skipCache: true }
  )

  // Bucket daily counts into 48h windows per neighborhood.
  // 48h bucket = floor(daysSinceEpoch / 2) * 2 — neighbors days into pairs.
  const byNeighborhood: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    if (!r.neighborhood) continue
    const dayMs = Date.parse(r.window_start)
    if (isNaN(dayMs)) continue
    const days = Math.floor(dayMs / (24 * 60 * 60 * 1000))
    const bucket = Math.floor(days / 2) * 2
    const key = String(bucket)
    if (!byNeighborhood[r.neighborhood]) byNeighborhood[r.neighborhood] = {}
    byNeighborhood[r.neighborhood][key] = (byNeighborhood[r.neighborhood][key] ?? 0) + parseInt(r.cnt, 10)
  }

  // Convert to arrays of counts
  const historicalCounts: Record<string, number[]> = {}
  for (const [nh, buckets] of Object.entries(byNeighborhood)) {
    historicalCounts[nh] = Object.values(buckets)
  }

  return { historicalCounts }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdDev(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

export interface UseAnomalyBaselineResult {
  anomalies: AnomalyResult[]
  isLoading: boolean
  error: string | null
}

export function useAnomalyBaseline(opts: {
  datasets: DatasetId[]
  currentEvents: NormalizedEvent[]
}): UseAnomalyBaselineResult {
  const [baseline, setBaseline] = useState<Record<DatasetId, BaselineEntry> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cacheKey = [...opts.datasets].sort().join(',')

  useEffect(() => {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setBaseline(cached.baseline)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    loadBaseline(cacheKey, opts.datasets)
      .then((b) => {
        if (cancelled) return
        setBaseline(b)
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setIsLoading(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  // Compute current 48h counts per (neighborhood × dataset)
  const anomalies: AnomalyResult[] = []
  if (baseline) {
    const currentCounts: Record<DatasetId, Record<string, number>> = {} as Record<DatasetId, Record<string, number>>
    for (const id of opts.datasets) currentCounts[id] = {}
    for (const ev of opts.currentEvents) {
      if (!ev.neighborhood) continue
      if (!currentCounts[ev.datasetId]) continue
      currentCounts[ev.datasetId][ev.neighborhood] = (currentCounts[ev.datasetId][ev.neighborhood] ?? 0) + 1
    }

    for (const datasetId of opts.datasets) {
      const entry = baseline[datasetId]
      if (!entry) continue
      for (const [nh, history] of Object.entries(entry.historicalCounts)) {
        if (history.length < 5) continue  // not enough N for a defensible σ
        const m = mean(history)
        const sd = stdDev(history, m)
        if (sd === 0) continue  // can't divide
        const cur = currentCounts[datasetId][nh] ?? 0
        const z = (cur - m) / sd
        anomalies.push({
          neighborhood: nh,
          datasetId,
          count48h: cur,
          baselineMean: m,
          baselineSd: sd,
          zScore: z,
        })
      }
    }
  }

  return { anomalies, isLoading, error }
}
