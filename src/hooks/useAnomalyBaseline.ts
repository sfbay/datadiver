// src/hooks/useAnomalyBaseline.ts
//
// Computes per-(neighborhood × dataset) z-scores for HOTSPOTS mode.
//
// Baseline window: 12 weeks of non-overlapping 48h windows = 42 samples
// per (neighborhood, dataset). Fetched server-side via a single Socrata
// query per dataset that GROUP BY neighborhood and bucket events into
// 48h windows.
//
// The window contains only COMPLETE SF day-pairs and ends before the live
// rolling 48h window — the current spike is never inside its own baseline.
// All bounds/bucketing arithmetic lives in anomalyBaselineWindow.ts (tested).
//
// Cached for the session — refreshes only when the hook is first
// instantiated (HOTSPOTS mode entry). Re-entry uses cache.

import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { baselineWindow } from './anomalyBaselineWindow'
import { bucketDailyCounts, computeAnomalies, type BaselineRow } from '@/lib/pulse/anomalyStats'
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

async function fetchBaselineForDataset(datasetId: DatasetId): Promise<BaselineEntry> {
  const dateField = DATE_FIELD[datasetId]
  const nhField = NEIGHBORHOOD_FIELD[datasetId]
  const registryKey = DATASET_REGISTRY_KEY[datasetId]

  // Complete SF day-pairs only, ending before the live 48h window — SF-local
  // digits (never toISOString: DataSF reads bare digits as SF wall time).
  const { since, until } = baselineWindow(Date.now())

  const rows = await fetchDataset<BaselineRow>(
    // DatasetKey is just a string alias — cast is safe since all
    // DATASET_REGISTRY_KEY values are valid keys in src/api/datasets.ts
    registryKey as Parameters<typeof fetchDataset>[0],
    {
      $select: `${nhField} as neighborhood, date_trunc_ymd(${dateField}) as window_start, COUNT(*) as cnt`,
      $where: `${dateField} >= '${since}' AND ${dateField} < '${until}' AND ${nhField} IS NOT NULL`,
      $group: `${nhField}, date_trunc_ymd(${dateField})`,
      $limit: 50000,
    },
    { skipCache: true }
  )

  return { historicalCounts: bucketDailyCounts(rows) }
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
      anomalies.push(...computeAnomalies(entry.historicalCounts, currentCounts[datasetId] ?? {}, datasetId))
    }
  }

  return { anomalies, isLoading, error }
}
