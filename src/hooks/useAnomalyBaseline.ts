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
//
// CURRENT counts are ALSO server-side (since Sept. 2 2026): one grouped
// count(*) per stream over the live 48h window, the same shape the digest
// cron uses (api/_lib/pulse.ts). They are independent of the draw cap —
// useLast48Window draws at most 5,000 rows per stream, and on a busy 311
// weekday the window holds more, so tallying the drawn rows undercounted
// the big neighborhoods and leaned the whole map "quiet" by ~0.5σ. The
// drawn sample now only governs what is DRAWN; it never enters the math.
// Both queries filter the Fire/EMS 'None' sentinel (the literal string the
// feed uses for "no neighborhood", which survives IS NOT NULL) on BOTH
// sides, so a 42nd phantom neighborhood can't ride the baseline.

import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { baselineWindow, currentWindow } from './anomalyBaselineWindow'
import {
  bucketDailyCounts,
  computeAnomalies,
  suppressStaleQuiet,
  type BaselineRow,
} from '@/lib/pulse/anomalyStats'
import {
  LAST48_DATASETS,
  type AnomalyResult,
  type DatasetId,
  type FreshnessMap,
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
// 311 stays on the finer sffind vocabulary on BOTH the baseline and the
// current query (they must match each other); moving both to
// analysis_neighborhood is a separate, later change.
const NEIGHBORHOOD_FIELD: Record<DatasetId, string> = {
  '911-realtime':       'analysis_neighborhood',
  'fire-ems-dispatch':  'neighborhoods_analysis_boundaries',
  '311-cases':          'neighborhoods_sffind_boundaries',
}

/** Fire/EMS encodes "no neighborhood" as the literal string 'None' (13K+
 *  rows), which survives IS NOT NULL — filter the sentinel in BOTH the
 *  baseline and the current query (a no-op for 911/311, which use real SQL
 *  NULLs). Parity with api/_lib/pulse.ts. */
const NH_FILTER = (nhField: string) => `${nhField} IS NOT NULL AND ${nhField} != 'None'`

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
      $where: `${dateField} >= '${since}' AND ${dateField} < '${until}' AND ${NH_FILTER(nhField)}`,
      $group: `${nhField}, date_trunc_ymd(${dateField})`,
      $limit: 50000,
    },
    { skipCache: true }
  )

  return { historicalCounts: bucketDailyCounts(rows, { since, until }) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Current 48h counts — server-side, one grouped query per stream
// ─────────────────────────────────────────────────────────────────────────────

/** Grouped current-count row from Socrata. `neighborhood` is absent (the
 *  aliased key is omitted) for a NULL group — never a row we count. */
export interface CurrentCountRow {
  neighborhood?: string
  cnt: string
}

/** Parse grouped rows into { neighborhood: count }. Skips rows with no
 *  neighborhood or an unparseable count; last row wins on a duplicate key.
 *  Pure — mirrors the cron's loop in api/_lib/pulse.ts. */
export function currentCountsFromRows(rows: CurrentCountRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    if (!r.neighborhood) continue
    const n = parseInt(r.cnt, 10)
    if (!Number.isFinite(n)) continue
    out[r.neighborhood] = n
  }
  return out
}

/** Minimum spacing between current-count refreshes for one stream. The
 *  stream's freshness stamp is the trigger (new rows published → recount);
 *  this keeps a chatty 911 poll from re-counting every two minutes. */
export const CURRENT_MIN_INTERVAL_MS = 2 * 60 * 1000


// Single-flight per stream — Last48.tsx, Last48UnifiedView.tsx and the Pulse
// wire each instantiate this hook; a shared promise means one request per
// stream per refresh, however many instances are mounted.
const currentInflight = new Map<DatasetId, Promise<Record<string, number>>>()

/** @param anchorMs the stream's newest PUBLISHED event (freshness.maxEventTime)
 *  — the live window is anchored there, never at the wall clock (see
 *  currentWindow: 311 publishes ~15h behind and a clock window read a third
 *  quiet every afternoon). */
async function fetchCurrentCounts(datasetId: DatasetId, anchorMs: number): Promise<Record<string, number>> {
  const existing = currentInflight.get(datasetId)
  if (existing) return existing
  const dateField = DATE_FIELD[datasetId]
  const nhField = NEIGHBORHOOD_FIELD[datasetId]
  const registryKey = DATASET_REGISTRY_KEY[datasetId]
  const { since, until } = currentWindow(anchorMs)
  const p = fetchDataset<CurrentCountRow>(
    registryKey as Parameters<typeof fetchDataset>[0],
    {
      $select: `${nhField} as neighborhood, COUNT(*) as cnt`,
      // SF wall-clock digits — see sfTime.ts; toISOString() would start the
      // window 7–8h late. Bounded on BOTH sides at the publish edge.
      $where: `${dateField} >= '${since}' AND ${dateField} <= '${until}' AND ${NH_FILTER(nhField)}`,
      $group: nhField,
      $limit: 200,
    },
    { skipCache: true, timeoutMs: 15_000, retries: 1 },
  )
    .then(currentCountsFromRows)
    .finally(() => { currentInflight.delete(datasetId) })
  currentInflight.set(datasetId, p)
  return p
}

/** The freshness stamp that says "the stream has new rows": Socrata's
 *  publish time when the dataset exposes it, else the newest event time. */
function freshnessStamp(freshness: FreshnessMap, id: DatasetId): number | null {
  const f = freshness[id]
  return f?.rowsUpdatedAt ?? f?.maxEventTime ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAnomalyBaselineResult {
  anomalies: AnomalyResult[]
  /** Baseline loading, OR some enabled stream has neither current counts
   *  nor a current-count error yet. */
  isLoading: boolean
  /** Baseline fetch error, or null. */
  error: string | null
  /** First stream's current-count error, or null. A stream whose count
   *  failed contributes NO anomalies (absence, not "quiet"). */
  currentError: string | null
  /** Enabled streams whose current-count query FAILED (no counts landed) and
   *  that therefore contribute NO anomalies. The surviving streams then
   *  render as the whole comparison — the Stouffer combine runs on k−1 — so
   *  every consumer that shows anomalies must SAY so (the transparency rule:
   *  suppressed WITH the reason, never silently absent). Empty when every
   *  enabled stream has counts or is still pending. */
  missingCurrent: DatasetId[]
}

export function useAnomalyBaseline(opts: {
  datasets: DatasetId[]
  /** Per-stream freshness from useLast48Window. REQUIRED: a quiet reading
   *  from a stream that simply hasn't published is not quiet, and every
   *  consumer of this hook renders quiet somewhere (the wire as a card, the
   *  choropleth as teal). Gating here rather than per consumer is what keeps
   *  the Pulse card and its evidence map from contradicting each other.
   *  Its stamps also drive the current-count refresh. */
  freshness: FreshnessMap
}): UseAnomalyBaselineResult {
  const [baseline, setBaseline] = useState<Record<DatasetId, BaselineEntry> | null>(null)
  const [isBaselineLoading, setIsBaselineLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cacheKey = [...opts.datasets].sort().join(',')

  useEffect(() => {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setBaseline(cached.baseline)
      setIsBaselineLoading(false)
      return
    }

    let cancelled = false
    setIsBaselineLoading(true)

    loadBaseline(cacheKey, opts.datasets)
      .then((b) => {
        if (cancelled) return
        setBaseline(b)
        setIsBaselineLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setIsBaselineLoading(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  // ── Current 48h counts, per stream ─────────────────────────────────────
  // ABSENT (undefined) until the server answers; on failure it STAYS absent
  // and the per-stream error is set — never a client tally fallback, which
  // would reintroduce the capped-sample lean.
  const [currentCounts, setCurrentCounts] = useState<Partial<Record<DatasetId, Record<string, number>>>>({})
  const [currentErrors, setCurrentErrors] = useState<Partial<Record<DatasetId, string>>>({})
  // Bookkeeping for the refresh policy (refs: they must not re-render).
  const currentLoadedAt = useRef<Partial<Record<DatasetId, number>>>({})
  const currentStampAt = useRef<Partial<Record<DatasetId, number | null>>>({})
  const enabledSet = useMemo(() => new Set(opts.datasets), [opts.datasets])
  // A count in flight is cancelled ONLY by unmount — never by a dep change.
  // The head fetch moves a stream's freshness stamp seconds after mount; a
  // per-run cleanup would discard the first count's result and the interval
  // guard would then skip the re-run, stranding the stream without counts.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // One effect per stream — LAST48_DATASETS is a constant 3-item array, so
  // the hook count is stable whatever `datasets` the caller passes (the same
  // idiom useLast48Window uses for its pollers). Refetch when (a) mounted
  // with no attempt yet, or (b) the stream's freshness stamp changed since
  // the last attempt AND at least CURRENT_MIN_INTERVAL_MS has passed.
  for (const id of LAST48_DATASETS) {
    const enabled = enabledSet.has(id)
    const stamp = freshnessStamp(opts.freshness, id)
    // The live window's anchor: the stream's newest PUBLISHED event. Null
    // until its rows have arrived — nothing to anchor on, so wait.
    const anchor = opts.freshness[id]?.maxEventTime ?? null
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!enabled || anchor == null) return
      const now = Date.now()
      const lastAt = currentLoadedAt.current[id]
      const attempted = lastAt !== undefined
      const stampChanged = currentStampAt.current[id] !== stamp
      const intervalOk = !attempted || now - (lastAt ?? 0) >= CURRENT_MIN_INTERVAL_MS
      if (attempted && !(stampChanged && intervalOk)) return

      currentLoadedAt.current[id] = now
      currentStampAt.current[id] = stamp
      fetchCurrentCounts(id, anchor)
        .then((counts) => {
          if (!mountedRef.current) return
          setCurrentCounts((prev) => ({ ...prev, [id]: counts }))
          setCurrentErrors((prev) => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
        })
        .catch((e) => {
          if (!mountedRef.current) return
          setCurrentErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : String(e) }))
        })
    }, [id, enabled, stamp, anchor])
  }

  // ── Anomalies: only streams with BOTH a baseline and current counts ─────
  // A stream without current counts contributes nothing (absence, not
  // "quiet" — computeAnomalies would read every missing neighborhood as 0).
  const anomalies: AnomalyResult[] = []
  if (baseline) {
    for (const datasetId of opts.datasets) {
      const entry = baseline[datasetId]
      const current = currentCounts[datasetId]
      if (!entry || !current) continue
      anomalies.push(...computeAnomalies(entry.historicalCounts, current, datasetId))
    }
  }

  const currentPending = opts.datasets.some(
    (id) => currentCounts[id] === undefined && !currentErrors[id],
  )
  const currentError =
    opts.datasets.map((id) => currentErrors[id]).find((e): e is string => typeof e === 'string') ?? null
  // Memoized: consumers put this in effect/memo deps and render copy from it.
  const missingCurrent = useMemo(
    () => opts.datasets.filter((id) => currentCounts[id] === undefined && !!currentErrors[id]),
    [opts.datasets, currentCounts, currentErrors],
  )

  return {
    anomalies: suppressStaleQuiet(anomalies, opts.freshness),
    isLoading: isBaselineLoading || currentPending,
    error,
    currentError,
    missingCurrent,
  }
}
