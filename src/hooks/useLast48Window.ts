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
//
// 4. The 5,000-row cap (LAST48_ROW_CAP) is a DRAW limit, not the window's
//    truth: when a FULL fetch returns exactly the cap, the window may hold
//    more than we drew, and the hook counts the window's true size server-
//    side (one count(*) at the same cutoff) into totalInWindowByDataset.
//    The OLDEST rows are the missing ones ($order DESC) — every consumer
//    that states a count goes through src/hooks/last48Truncation.ts.
//    truncatedByDataset is a COVERAGE fact, not a last-draw fact: held rows
//    accumulate across polls (note 3 — the byId Map is merged, then evicted
//    at 48h), so a tab left open fills the cut in over a few hours while
//    every poll keeps returning exactly the cap. coverageTruncated() decides
//    it from the oldest held row and the count, never from rows.length alone.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { fetchDataset } from '@/api/client'
import type { ViewId } from '@/cities/manifest'
import { usePollCadence } from '@/hooks/usePollCadence'
import {
  LAST48_DATASETS,
  type DatasetId,
  type DatasetFreshness,
  type FreshnessMap,
  type NormalizedEvent,
} from '@/types/last48'
import { normalizeEvent } from '@/utils/eventNormalization'
import { sfLocalCutoff } from '@/utils/sfTime'
import { LAST48_ROW_CAP, coverageTruncated, LAST48_COUNT_EXPR } from './last48Truncation'

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
// Head query strategy: $where-bounded to a SMALL window (HEAD_WINDOW_MS) +
// $order DESC + $limit.
//
// History (PR #53): we briefly tried dropping $where entirely (just $order
// + $limit) on the theory that "most recent N rows" would hit Socrata's
// indexed path uniformly. That HUNG Fire/EMS and 311 in production —
// without a $where bound, those large multi-year datasets had to materialize
// a full sort before applying the limit, and the query stalled. 911 (smaller,
// better-indexed) survived, which is why only it loaded. Restoring the
// $where bound fixes the hang: the date filter lets Socrata's planner scope
// the work to a small recent slice regardless of total table size.
//
// HEAD_WINDOW_MS = 6h: wider than the original 2h for safety against quiet
// periods (a stream that's published nothing in 2h would return an empty
// head), small enough that the bounded query stays fast.
//
// HEAD_LIMIT = 200: small enough that the chronological reveal is visibly
// trackable (~33 events/sec over 6s for 911 — eye can follow), large enough
// to feel populated. The useLast48Window eviction loop drops anything older
// than 48h.
//
// FULL_LIMIT = LAST48_ROW_CAP (5,000): the most rows we DRAW per stream for
// the 48h window — Jesse's ruling (Sept. 2 2026): keep the newest 5,000 dots,
// don't raise it, don't page. It is NOT the window's truth: 311 runs past it
// on busy weekdays (measured 5,300–5,516 over two days), and because the
// query is $order DESC the OLDEST hours are what go missing. The cap is
// DISCLOSED, not silent — a full fetch that returns exactly the cap while
// the held rows still stop short of the window start trips
// truncatedByDataset, and a server count(*) at the same cutoff fills
// totalInWindowByDataset, so every stated count can be true.
const HEAD_WINDOW_MS = 6 * 60 * 60 * 1000 // 6 hours
const HEAD_LIMIT = 200
const FULL_LIMIT = LAST48_ROW_CAP
// The count(*) runs AFTER the heavy rows fetch, sequentially, so it never
// joins the cold-load burst; a failure leaves the total null (ABSENT) and
// never marks the stream errored — the rows arrived.
const COUNT_TIMEOUT_MS = 15_000
const COUNT_RETRIES = 1

// ── Resilience parameters ──────────────────────────────────────────────────
// FETCH_TIMEOUT_MS aborts a stalled request (bare fetch never times out).
// FETCH_RETRIES re-attempts on timeout/error — a cold-load retry, fired after
// the connection burst drains, usually succeeds. FULL_STAGGER_MS spreads the
// three heavy 48h backfills (each ~3-5MB) so they don't fire simultaneously
// and starve each other at the browser's per-host connection limit (measured
// ~7x slower under that burst). 911=0ms, Fire/EMS=700ms, 311=1400ms.
const FETCH_TIMEOUT_MS = 18_000
const FETCH_RETRIES = 2
const FULL_STAGGER_MS = 700

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
   *  successful (HEAD) fetch; never resets. Drives DatasetSuperChips loading
   *  state and StreamProgressBar — the chip counts can populate from head data. */
  initialLoadedByDataset: Record<DatasetId, boolean>
  /** Per-dataset FULL-load flags. Flips true after each dataset's backfill
   *  (full 48h) fetch completes; never resets. The Stream Curtain serialized
   *  sweep gates on THIS (not initialLoadedByDataset) so each stream sweeps
   *  its complete data in one chronological pass — see FlowMapLayer. */
  fullyLoadedByDataset: Record<DatasetId, boolean>
  /** Per-dataset terminal error (retries exhausted), or null. Drives the
   *  failure banner + retry affordance, and lets the loading state SETTLE so
   *  the radar stops spinning instead of hanging on a failed stream. */
  errorByDataset: Record<DatasetId, string | null>
  /** True when the rows HELD for the stream fall short of its window: the
   *  last FULL fetch returned exactly the cap AND the held rows (which
   *  accumulate across polls) still stop short of the window start — see
   *  coverageTruncated(). The oldest rows are the missing ones. Clears on
   *  its own once a long-open tab's polls have filled the cut in. Read it
   *  only alongside fullyLoadedByDataset — the head phase never trips it. */
  truncatedByDataset: Record<DatasetId, boolean>
  /** Server count (LAST48_COUNT_EXPR — the stream's own unit, distinct
   *  calls for Fire/EMS) for the SAME cutoff as the last capped full fetch;
   *  null when not capped (use the loaded count) or when the count query
   *  failed (ABSENT — render '—' for anything that depends on it). Go
   *  through windowTotal()/windowTotalAcross() rather than reading it raw. */
  totalInWindowByDataset: Record<DatasetId, number | null>
  /** Clear a dataset's error and re-attempt it from the (fast) head phase. */
  retryDataset: (id: DatasetId) => void
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
   *  dataset's first successful (HEAD) fetch; never resets. */
  initialLoadedByDataset: Record<DatasetId, boolean>
  /** Per-dataset full-load flag — flips true after the backfill (full 48h)
   *  fetch completes; never resets. */
  fullyLoadedByDataset: Record<DatasetId, boolean>
  /** Per-dataset terminal error (retries exhausted), or null. */
  errorByDataset: Record<DatasetId, string | null>
  /** Held rows fall short of the window (see Last48WindowResult). */
  truncatedByDataset: Record<DatasetId, boolean>
  /** Server count(*) for the capped window, or null (see Last48WindowResult). */
  totalInWindowByDataset: Record<DatasetId, number | null>
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
  fullyLoadedByDataset: Record<DatasetId, boolean>
  errorByDataset: Record<DatasetId, string | null>
  truncatedByDataset: Record<DatasetId, boolean>
  totalInWindowByDataset: Record<DatasetId, number | null>
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
  /** Identity metadata for the citation recorder — one facet per stream
   *  (facet: datasetId) so the three streams never share a slot even though
   *  purpose alone would collide. */
  cite?: { viewId: ViewId; sample: 'window-sample'; count: 'window-count' }
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
    fullyLoadedByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, false])
    ) as Record<DatasetId, boolean>,
    errorByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, null])
    ) as Record<DatasetId, string | null>,
    truncatedByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, false])
    ) as Record<DatasetId, boolean>,
    totalInWindowByDataset: Object.fromEntries(
      LAST48_DATASETS.map((id) => [id, null])
    ) as Record<DatasetId, number | null>,
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
    fullyLoadedByDataset: stateRef.current.fullyLoadedByDataset,
    errorByDataset: stateRef.current.errorByDataset,
    truncatedByDataset: stateRef.current.truncatedByDataset,
    totalInWindowByDataset: stateRef.current.totalInWindowByDataset,
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
      fullyLoadedByDataset: { ...s.fullyLoadedByDataset },
      errorByDataset: { ...s.errorByDataset },
      truncatedByDataset: { ...s.truncatedByDataset },
      totalInWindowByDataset: { ...s.totalInWindowByDataset },
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

  // Backfill stagger timers — tracked so unmount cancels any not-yet-fired
  // backfill (indices 1–2 fire 700/1400ms after their head fetch; the user
  // can navigate away inside that window, and an orphaned fetcher would then
  // run against this hook's stale refs for nothing).
  const staggerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const timers = staggerTimersRef.current
    return () => { timers.forEach(clearTimeout) }
  }, [])

  const buildFetcher = useCallback((datasetId: DatasetId) => {
    const fetcherFn = async (): Promise<void> => {
      // Early-return when this dataset is not currently enabled.
      if (!enabledSetRef.current.has(datasetId)) return

      const state = stateRef.current

      // Position in LAST48_DATASETS — drives the backfill stagger so the heavy
      // 48h queries don't all fire at once (911=0, Fire/EMS=1, 311=2).
      const datasetIndex = LAST48_DATASETS.indexOf(datasetId)

      // Determine phase + parameters for this call.
      const isHead = phaseRef.current[datasetId] === 'head'
      const limit = isHead ? HEAD_LIMIT : FULL_LIMIT

      // Mark polling start
      state.isPollingByDataset = { ...state.isPollingByDataset, [datasetId]: true }
      notify()

      const dateField = DATE_FIELD[datasetId]
      const registryKey = DATASET_REGISTRY_KEY[datasetId]

      // Both phases are $where-bounded — head to 6h, full to 48h. The $where
      // bound is what keeps the query fast on large datasets (it scopes the
      // sort to a recent slice). The cutoff must be SF WALL-CLOCK digits —
      // DataSF stores floating local times, so toISOString() (UTC digits)
      // started the window 7–8h late (~41h of "48h"). See src/utils/sfTime.ts.
      const windowMs = isHead ? HEAD_WINDOW_MS : WINDOW_MS
      const cutoff = sfLocalCutoff(Date.now() - windowMs)
      const queryParams: Parameters<typeof fetchDataset>[1] = {
        $where: `${dateField} >= '${cutoff}'`,
        $order: `${dateField} DESC`,
        $limit: limit,
      }

      try {
        const rows = await fetchDataset<Record<string, unknown>>(
          // DatasetKey is just a string alias — cast is safe since all
          // DATASET_REGISTRY_KEY values are verified against datasets.ts
          registryKey as Parameters<typeof fetchDataset>[0],
          queryParams,
          {
            skipCache: true, timeoutMs: FETCH_TIMEOUT_MS, retries: FETCH_RETRIES,
            cite: opts.cite ? { viewId: opts.cite.viewId, purpose: opts.cite.sample, facet: datasetId } : undefined,
          }
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

        // 48h eviction for this dataset only. The same pass measures what we
        // now HOLD for the stream — count + oldest row — which is what the
        // row-cap tripwire below reads (coverage, not the size of this draw).
        const evictBefore = now - WINDOW_MS
        let heldCount = 0
        let oldestHeldMs: number | null = null
        for (const [key, ev] of newById) {
          if (ev.datasetId !== datasetId) continue
          if (ev.receivedAt < evictBefore) {
            newById.delete(key)
            continue
          }
          heldCount += 1
          if (oldestHeldMs === null || ev.receivedAt < oldestHeldMs) oldestHeldMs = ev.receivedAt
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

        // A successful fetch clears any prior terminal error.
        if (state.errorByDataset[datasetId]) {
          state.errorByDataset = { ...state.errorByDataset, [datasetId]: null }
        }

        // Two-phase transition: after a successful head fetch, advance to
        // 'full' phase and schedule the backfill. The stagger (per dataset
        // index) keeps the three heavy 48h queries from firing at once and
        // starving each other at the browser's per-host connection limit.
        if (isHead) {
          phaseRef.current[datasetId] = 'full'
          staggerTimersRef.current.push(
            setTimeout(() => { void fetcherFn() }, FULL_STAGGER_MS * datasetIndex),
          )
        } else {
          // ── Row-cap tripwire ──────────────────────────────────────────
          // A full fetch that returns exactly the cap MAY have drawn from a
          // window that holds more rows; $order DESC means the oldest hours
          // are the ones missing. But held rows accumulate across polls, so
          // the fact that matters — "do the rows we hold stop short of the
          // window start?" — is decided by coverageTruncated() from the
          // oldest held row, not from this draw's size: a tab left open
          // fills the cut in over a few hours and the flag clears, while
          // every poll still returns exactly the cap. When coverage falls
          // short, count the window's true size server-side at the SAME
          // cutoff string as the rows query, so the total describes the
          // window we drew from; the count also settles the one ambiguity
          // coverage can't (a quiet stretch at the window's edge vs a cut —
          // if we hold at least the counted rows, nothing is missing). Runs
          // after the heavy fetch, sequentially — it never joins the
          // cold-load burst. A count failure leaves the total null (ABSENT)
          // and must NOT mark the stream errored: the rows arrived.
          //
          // On the cold-load backfill the drawn rows are published first (an
          // interim notify) so they paint while the count is in flight; the
          // fullyLoaded flip below waits for the count so the first "fully
          // loaded" snapshot already carries the truncation state (the
          // chip/rail copy gates on it). Later polls notify once, after the
          // count — the page is already populated, and an interim null total
          // would flash "window total unavailable" every 30 minutes.
          const coverage = {
            drewCap: rows.length >= limit,
            heldCount,
            oldestHeldMs,
            windowStartMs: evictBefore,
          }
          let truncated = coverageTruncated({ ...coverage, serverTotal: null })
          state.truncatedByDataset = { ...state.truncatedByDataset, [datasetId]: truncated }
          if (truncated) {
            if (!state.fullyLoadedByDataset[datasetId]) {
              state.totalInWindowByDataset = { ...state.totalInWindowByDataset, [datasetId]: null }
              notify()
            }
            try {
              const countRows = await fetchDataset<{ cnt: string }>(
                registryKey as Parameters<typeof fetchDataset>[0],
                { $select: `${LAST48_COUNT_EXPR[datasetId]} as cnt`, $where: `${dateField} >= '${cutoff}'`, $limit: 1 },
                {
                  skipCache: true, timeoutMs: COUNT_TIMEOUT_MS, retries: COUNT_RETRIES,
                  cite: opts.cite ? { viewId: opts.cite.viewId, purpose: opts.cite.count, facet: datasetId } : undefined,
                },
              )
              const parsed = parseInt(countRows[0]?.cnt ?? '', 10)
              const n = Number.isFinite(parsed) ? parsed : null
              // The count can only CLEAR the flag (we hold everything it
              // counted), never set it — see coverageTruncated().
              truncated = coverageTruncated({ ...coverage, serverTotal: n })
              state.truncatedByDataset = { ...state.truncatedByDataset, [datasetId]: truncated }
              state.totalInWindowByDataset = {
                ...state.totalInWindowByDataset,
                [datasetId]: truncated ? n : null,
              }
            } catch {
              state.totalInWindowByDataset = { ...state.totalInWindowByDataset, [datasetId]: null }
            }
          } else {
            state.totalInWindowByDataset = { ...state.totalInWindowByDataset, [datasetId]: null }
          }

          // Full (backfill or poll) fetch succeeded — this dataset now has
          // its complete 48h data. The Stream Curtain sweep gates on this
          // flag so each stream sweeps its FULL data in one chronological
          // pass (see FlowMapLayer enabled gates).
          if (!state.fullyLoadedByDataset[datasetId]) {
            state.fullyLoadedByDataset = { ...state.fullyLoadedByDataset, [datasetId]: true }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Keep prior freshness values; update only the error field
        const prior = state.freshness[datasetId]
        state.freshness = {
          ...state.freshness,
          [datasetId]: { ...prior, error: message },
        }
        if (isHead) {
          // Head failed — advance to 'full' and fire the backfill NOW
          // (staggered), rather than stranding the dataset until the next
          // poll (up to 30 min away for Fire/EMS and 311). fetchDataset has
          // already exhausted its own retries, so this is the fallback window.
          phaseRef.current[datasetId] = 'full'
          staggerTimersRef.current.push(
            setTimeout(() => { void fetcherFn() }, FULL_STAGGER_MS * datasetIndex),
          )
        } else {
          // Full fetch failed after retries → terminal. Record the error so
          // the loading state SETTLES (the radar stops instead of hanging on
          // this stream) and the UI can offer a retry.
          state.errorByDataset = { ...state.errorByDataset, [datasetId]: message }
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

  // Clear a dataset's terminal error and re-attempt from the fast head phase.
  // A single-dataset retry has no cold-load burst to compete with, so it
  // typically lands quickly even if the original starved.
  const retryDataset = useCallback((id: DatasetId) => {
    const s = stateRef.current
    if (s.errorByDataset[id]) {
      s.errorByDataset = { ...s.errorByDataset, [id]: null }
    }
    phaseRef.current[id] = 'head'
    notify()
    void buildFetcher(id)()
  }, [buildFetcher, notify])

  // ── Derive result from snapshot ──────────────────────────────────────────
  // Memoized on the byId Map REFERENCE (replaced on every real mutation, per
  // architecture note 3). Without this, every render produced a fresh sorted
  // array, which cascaded new identities into visibleEvents → three
  // useChronologicalReveal effects → FlowMapLayer — a steady re-render storm
  // (and up to ~6000 redundant setFeatureState calls per render in the
  // reveal's defensive re-reveal path).
  const allEvents = useMemo(
    () =>
      Array.from(snapshot.byId.values()).sort(
        (a, b) => b.receivedAt - a.receivedAt
      ),
    [snapshot.byId]
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
    fullyLoadedByDataset: snapshot.fullyLoadedByDataset,
    errorByDataset: snapshot.errorByDataset,
    truncatedByDataset: snapshot.truncatedByDataset,
    totalInWindowByDataset: snapshot.totalInWindowByDataset,
    retryDataset,
    refetch,
  }
}
