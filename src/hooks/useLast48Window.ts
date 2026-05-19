// src/hooks/useLast48Window.ts
//
// Central 48-hour sliding-window data engine for The Last 48 view.
//
// Architecture notes:
//
// 1. Internal state is held in a useRef (not useState) to avoid re-rendering
//    on every poll cycle. Consumers subscribe via useSyncExternalStore so
//    React batches their re-renders around a stable snapshot.
//
// 2. usePollCadence is called UNCONDITIONALLY once per entry in
//    LAST48_DATASETS (a constant 3-item array), giving React a stable
//    hook count regardless of which datasets the caller enables. The per-
//    dataset fetcher checks enabledSet.has(datasetId) at its very top and
//    returns immediately when the dataset is not enabled — polling is a
//    no-op for disabled datasets.
//
// 3. The byId Map is replaced with a new Map reference on every mutation so
//    useSyncExternalStore snapshot comparisons work correctly (reference
//    inequality ↔ "something changed").

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { fetchDataset } from '@/api/client'
import { usePollCadence } from '@/hooks/usePollCadence'
import {
  LAST48_DATASETS,
  type DatasetId,
  type DatasetFreshness,
  type FreshnessMap,
  type NormalizedEvent,
} from '@/types/last48'
import { normalizeEvent } from '@/utils/eventNormalization'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours

// ── Two-phase fetch parameters ─────────────────────────────────────────────
// On cold-load, each stream's FIRST fetch is the "head" — a small, fast
// query. As soon as it completes, the phase transitions to 'full' and a
// backfill fetch fires immediately (without waiting for the next poll
// interval). Subsequent polls at the regular cadence use the full window.
//
// Head query strategy: NO $where filter, just $order DESC + $limit. Socrata
// indexes the `$order` field, so "give me the most recent N rows" hits a
// fast indexed access path; a `$where date >= cutoff` filter sometimes
// falls back to a full table scan depending on the dataset's index
// configuration. The previous head strategy (2h window via $where) had
// inconsistent latency — fast on hot caches, ~60s on cold caches. Dropping
// $where pins the head query to the indexed path reliably.
//
// HEAD_LIMIT = 200: small enough that the chronological reveal is
// visibly trackable (~33 events/sec over 6s for 911 — eye can follow),
// large enough to feel populated rather than empty. For 911 with ~58
// events/hr, 200 events ≈ 3.4 hours of data; for 311 with ~48/hr,
// ~4.2 hours; for Fire/EMS with ~11/hr, ~18 hours. All within 48h
// window. The useLast48Window eviction loop drops anything older.
const HEAD_LIMIT = 200
const FULL_LIMIT = 5000

const POLL_INTERVALS: Record<DatasetId, number> = {
  '911-realtime':      2 * 60 * 1000,
  'fire-ems-dispatch': 30 * 60 * 1000,
  '311-cases':         30 * 60 * 1000,
}

type FetchPhase = 'head' | 'full'

/** Maps our DatasetId to the key used in src/api/datasets.ts DATASETS record */
const DATASET_REGISTRY_KEY: Record<DatasetId, string> = {
  '911-realtime':      'dispatch911Realtime',
  'fire-ems-dispatch': 'fireEMSDispatch',
  '311-cases':         'cases311',
}

/** The date/time field used for the sliding-window $where clause */
const DATE_FIELD: Record<DatasetId, string> = {
  '911-realtime':      'received_datetime',
  'fire-ems-dispatch': 'received_dttm',
  '311-cases':         'requested_datetime',
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface Last48WindowResult {
  /** All events merged across enabled datasets, sorted newest-first. */
  events: NormalizedEvent[]
  /** Events grouped by dataset for per-dataset views. */
  byDataset: Record<DatasetId, NormalizedEvent[]>
  /** Per-dataset freshness metrics. */
  freshness: FreshnessMap
  /** True until the first successful fetch for any enabled dataset completes. */
  isLoading: boolean
  /** True while any enabled dataset is currently mid-fetch. */
  isPolling: boolean
  /** Per-dataset initial-load flags. Flips to true after each dataset's first
   *  successful fetch; never resets. Drives DatasetSuperChips loading state
   *  and StreamProgressBar. */
  initialLoadedByDataset: Record<DatasetId, boolean>
  /** Immediately re-fetch all enabled datasets, bypassing the cadence. */
  refetch: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state shape (held in useRef, mutated in-place then snapshotted)
// ─────────────────────────────────────────────────────────────────────────────

interface InternalState {
  /** De-duplicated event map. byId is replaced (new Map) on every mutation. */
  byId: Map<string, NormalizedEvent>
  freshness: FreshnessMap
  /** Per-dataset mid-fetch flag. */
  isPollingByDataset: Record<DatasetId, boolean>
  /** Flips to true on first successful fetch; never goes back. */
  initialLoadComplete: boolean
  /** Per-dataset version of initialLoadComplete — flips true on each
   *  dataset's first successful fetch; never resets. */
  initialLoadedByDataset: Record<DatasetId, boolean>
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot type (the value useSyncExternalStore exposes to consumers)
// ─────────────────────────────────────────────────────────────────────────────

interface Snapshot {
  byId: Map<string, NormalizedEvent>
  freshness: FreshnessMap
  isPollingByDataset: Record<DatasetId, boolean>
  initialLoadComplete: boolean
  initialLoadedByDataset: Record<DatasetId, boolean>
}

function buildEmptyFreshness(): FreshnessMap {
  const out = {} as FreshnessMap
  for (const id of LAST48_DATASETS) {
    out[id] = {
      rowsUpdatedAt: null,
      maxEventTime: null,
      eventLagMs: null,
      refreshLagMs: null,
      error: null,
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLast48Window(opts: {
  datasets: DatasetId[]
}): Last48WindowResult {
  // ── Stable enabled-set memo ──────────────────────────────────────────────
  const enabledSet = useMemo(() => new Set(opts.datasets), [opts.datasets])

  // ── Internal mutable state ───────────────────────────────────────────────
  const stateRef = useRef<InternalState>({
    byId: new Map(),
    freshness: buildEmptyFreshness(),
    isPollingByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, false])
    ) as Record<DatasetId, boolean>,
    initialLoadComplete: false,
    initialLoadedByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, false])
    ) as Record<DatasetId, boolean>,
  })

  // ── useSyncExternalStore wiring ──────────────────────────────────────────
  // The "store" is the snapshot ref itself. Every time we want to notify
  // React, we replace snapshotRef.current with a new object reference and
  // call all listeners.
  const snapshotRef = useRef<Snapshot>({
    byId: stateRef.current.byId,
    freshness: stateRef.current.freshness,
    isPollingByDataset: stateRef.current.isPollingByDataset,
    initialLoadComplete: stateRef.current.initialLoadComplete,
    initialLoadedByDataset: stateRef.current.initialLoadedByDataset,
  })

  const listenersRef = useRef<Set<() => void>>(new Set())

  const notify = useCallback(() => {
    const s = stateRef.current
    snapshotRef.current = {
      byId: s.byId,
      freshness: s.freshness,
      isPollingByDataset: { ...s.isPollingByDataset },
      initialLoadComplete: s.initialLoadComplete,
      initialLoadedByDataset: { ...s.initialLoadedByDataset },
    }
    listenersRef.current.forEach((l) => l())
  }, [])

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  const getSnapshot = useCallback((): Snapshot => snapshotRef.current, [])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // ── Fetcher factory ──────────────────────────────────────────────────────
  // Returns a () => Promise<void> suitable for usePollCadence.
  // Captures enabledSet via the ref updated on each render so the closed-over
  // value is always current without recreating the function identity.
  const enabledSetRef = useRef(enabledSet)
  enabledSetRef.current = enabledSet

  // Per-dataset fetch phase. Starts as 'head' for all; transitions to 'full'
  // after the first successful (or failed — see catch) head fetch. Once
  // 'full', all subsequent calls (poll-driven or otherwise) use the full
  // 48h window. The transition is one-way; never resets.
  const phaseRef = useRef<Record<DatasetId, FetchPhase>>(
    Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, 'head' as FetchPhase])
    ) as Record<DatasetId, FetchPhase>
  )

  const buildFetcher = useCallback((datasetId: DatasetId) => {
    const fetcherFn = async (): Promise<void> => {
      // Early-return when this dataset is not currently enabled.
      if (!enabledSetRef.current.has(datasetId)) return

      const state = stateRef.current

      // Determine phase + parameters for this call.
      const isHead = phaseRef.current[datasetId] === 'head'
      const limit = isHead ? HEAD_LIMIT : FULL_LIMIT

      // Mark polling start
      state.isPollingByDataset = { ...state.isPollingByDataset, [datasetId]: true }
      notify()

      const dateField = DATE_FIELD[datasetId]
      const registryKey = DATASET_REGISTRY_KEY[datasetId]

      // Head: $order DESC + $limit alone, no $where (indexed access path —
      // reliably fast across Socrata cache states).
      // Full: $where filtered to last 48h (the actual content window).
      // Socrata SoQL date comparison rejects the trailing `.000Z` produced
      // by `toISOString()` — use trimmed `YYYY-MM-DDTHH:MM:SS`.
      const queryParams: Parameters<typeof fetchDataset>[1] = isHead
        ? {
            $order: `${dateField} DESC`,
            $limit: limit,
          }
        : {
            $where: `${dateField} >= '${new Date(Date.now() - WINDOW_MS).toISOString().slice(0, 19)}'`,
            $order: `${dateField} DESC`,
            $limit: limit,
          }

      try {
        const rows = await fetchDataset<Record<string, unknown>>(
          // DatasetKey is just a string alias — cast is safe since all
          // DATASET_REGISTRY_KEY values are verified against datasets.ts
          registryKey as Parameters<typeof fetchDataset>[0],
          queryParams,
          { skipCache: true }
        )

        const now = Date.now()

        // Normalise and merge into byId (replace Map reference for snapshot stability).
        // Also extract `data_loaded_at` per row so we can compute a real
        // `rowsUpdatedAt` for the freshness chip strip — Socrata stamps each
        // row with the timestamp at which it was last published to the API.
        const newById = new Map(state.byId)
        let maxEventTime = 0
        let maxLoadedAt = 0

        for (const row of rows) {
          // Pull rows-updated timestamp from the dataset metadata column.
          // Both `data_loaded_at` and `data_as_of` appear in different SF
          // datasets; try the more common one first.
          const loadedRaw = row.data_loaded_at ?? row.data_as_of
          if (typeof loadedRaw === 'string') {
            const ms = Date.parse(loadedRaw)
            if (!isNaN(ms) && ms > maxLoadedAt) maxLoadedAt = ms
          }

          const event = normalizeEvent(datasetId, row)
          if (!event) continue
          newById.set(event.id, event)
          if (event.receivedAt > maxEventTime) maxEventTime = event.receivedAt
        }

        // 48h eviction for this dataset only
        const evictBefore = now - WINDOW_MS
        for (const [key, ev] of newById) {
          if (ev.datasetId === datasetId && ev.receivedAt < evictBefore) {
            newById.delete(key)
          }
        }

        // Update freshness — refreshLagMs derives from the row's own
        // data_loaded_at, NOT "now". Falls back to null when the dataset
        // doesn't expose the field.
        const freshDatasetEntry: DatasetFreshness = {
          rowsUpdatedAt: maxLoadedAt > 0 ? maxLoadedAt : null,
          maxEventTime: maxEventTime > 0 ? maxEventTime : null,
          eventLagMs: maxEventTime > 0 ? now - maxEventTime : null,
          refreshLagMs: maxLoadedAt > 0 ? now - maxLoadedAt : null,
          error: null,
        }

        state.byId = newById
        state.freshness = { ...state.freshness, [datasetId]: freshDatasetEntry }
        state.initialLoadComplete = true
        // Per-dataset flag — flip once, never reset. The head fetch is
        // enough to satisfy "initial load complete" — Stream Curtain can
        // start sweeping on the head's ~150 events while the backfill
        // continues in the background.
        if (!state.initialLoadedByDataset[datasetId]) {
          state.initialLoadedByDataset = { ...state.initialLoadedByDataset, [datasetId]: true }
        }

        // Two-phase transition: after a successful head fetch, advance to
        // 'full' phase and immediately schedule a backfill fetch. The
        // setTimeout(0) defers to the next macrotask so React renders the
        // head data first; the backfill query then fires without waiting
        // for the next poll interval (which would be 2-30 minutes away).
        if (isHead) {
          phaseRef.current[datasetId] = 'full'
          setTimeout(() => { void fetcherFn() }, 0)
        }
      } catch (err) {
        // Keep prior freshness values; update only the error field
        const prior = state.freshness[datasetId]
        state.freshness = {
          ...state.freshness,
          [datasetId]: {
            ...prior,
            error: err instanceof Error ? err.message : String(err),
          },
        }
        // If the head fetch failed, advance the phase anyway so the next
        // poll uses the full window — don't get stuck retrying head queries.
        // We don't schedule an immediate backfill in this case; let
        // usePollCadence retry at its normal cadence.
        if (isHead) {
          phaseRef.current[datasetId] = 'full'
        }
      } finally {
        state.isPollingByDataset = { ...state.isPollingByDataset, [datasetId]: false }
        notify()
      }
    }
    return fetcherFn
  }, [notify])

  // ── Polling scheduler — STABLE HOOK COUNT ───────────────────────────────
  // LAST48_DATASETS is a module-level constant with 3 entries. The
  // for-loop below is safe because the iteration count never changes — React
  // sees exactly 3 usePollCadence calls on every render.
  for (const datasetId of LAST48_DATASETS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    usePollCadence({
      intervalMs: POLL_INTERVALS[datasetId],
      fetch: buildFetcher(datasetId),
      label: `last48:${datasetId}`,
    })
  }

  // ── refetch ──────────────────────────────────────────────────────────────
  const refetch = useCallback(() => {
    for (const datasetId of LAST48_DATASETS) {
      if (enabledSetRef.current.has(datasetId)) {
        void buildFetcher(datasetId)()
      }
    }
  }, [buildFetcher])

  // ── Derive result from snapshot ──────────────────────────────────────────
  const allEvents = Array.from(snapshot.byId.values()).sort(
    (a, b) => b.receivedAt - a.receivedAt
  )

  const byDataset = useMemo<Record<DatasetId, NormalizedEvent[]>>(() => {
    const out = {} as Record<DatasetId, NormalizedEvent[]>
    for (const id of LAST48_DATASETS) {
      out[id] = []
    }
    for (const ev of allEvents) {
      out[ev.datasetId].push(ev)
    }
    return out
  }, [allEvents])

  const isPolling = Object.values(snapshot.isPollingByDataset).some(Boolean)
  const isLoading = !snapshot.initialLoadComplete

  return {
    events: allEvents,
    byDataset,
    freshness: snapshot.freshness,
    isLoading,
    isPolling,
    initialLoadedByDataset: snapshot.initialLoadedByDataset,
    refetch,
  }
}
