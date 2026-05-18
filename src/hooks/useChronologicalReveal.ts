// src/hooks/useChronologicalReveal.ts
//
// When a Mapbox source has just received its initial batch of point features,
// reveal those features in accelerated chronological order (oldest → newest)
// rather than letting them paint all-at-once.
//
// Mechanism: Mapbox feature-state. The consumer's layer wraps its opacity
// expression in `['case', ['boolean', ['feature-state', 'revealed'], false],
// existing, 0]` so features default to invisible. This hook drives the
// `revealed` flag to true on each feature as the chronological sweep crosses
// its position in the time window.
//
// Why feature-state and not setPaintProperty per frame: feature-state changes
// are cheap (no expression re-parse, no source re-tile) and exactly the
// pattern Mapbox documents for runtime per-feature state. The opacity
// expression stays static.
//
// IMPORTANT lifecycle considerations (lessons learned):
//   - The RAF lives in a ref that persists across renders. The effect's
//     cleanup does NOT cancel it on every events change — only on unmount.
//     Otherwise mid-sweep events updates (sibling streams arriving) kill the
//     sweep before it completes, onComplete never fires, and the next stream
//     in the serialized chain never starts.
//   - Feature-state CAN get wiped by Mapbox's `setData` even for features
//     with stable string ids (anecdotally observed during cross-stream
//     events updates). The hook defensively re-reveals already-known events
//     on every events change, after the sweep has progressed past them.
//     setFeatureState is idempotent for same values, so the cost is cheap.
//
// Reusable across views — any DataDiver surface that loads time-stamped
// point features and wants a chronological reveal instead of a bulk bloom.
// Currently consumed by FlowMapLayer for The Last 48; could naturally extend
// to Cases311, CrimeIncidents, ParkingCitations, etc.

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'

const DEFAULT_SWEEP_DURATION_MS = 4000

/**
 * FNV-1a 32-bit hash of a string. Maps stable string IDs to stable numeric
 * IDs for Mapbox feature-state.
 *
 * Why: Mapbox's setFeatureState lookup table treats string IDs differently
 * from numeric IDs internally, and feature-state can be silently dropped
 * across setData calls when string IDs are used. Numeric IDs are robust.
 *
 * Exported so FlowMapLayer can hash the same way when populating feature.id
 * at the GeoJSON level — both ends MUST agree on the hash. Collision risk
 * for ~6000 events in a 32-bit space is ~5 per million; acceptable.
 */
export function hashId(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = (h * 16777619) >>> 0
  }
  return h >>> 0
}

interface RevealEvent {
  id: string
  receivedAt: number
}

interface Options<E extends RevealEvent> {
  map: mapboxgl.Map | null
  /** Mapbox source id whose features carry top-level `id` matching event.id. */
  sourceId: string
  /** Events belonging to this stream. The hook reads them on the
   *  false → true transition of `enabled`. */
  events: E[]
  /** Flips false → true when the caller decides this stream may sweep.
   *  The sweep fires once, on that transition. Subsequent updates to
   *  `events` (incremental polls) reveal new events immediately.
   *  The caller is responsible for serializing streams (e.g., gating
   *  enabled on the previous stream's onComplete). */
  enabled: boolean
  /** Total time to reveal all events in this stream. Defaults to 4000ms.
   *  Pass a longer duration for streams that establish the canvas (first
   *  in the chain) and shorter durations for streams that overlay onto an
   *  already-populated map. */
  durationMs?: number
  /** Fires when the sweep completes — either after the RAF loop finishes
   *  on a normal sweep, or immediately after reduced-motion / empty-events
   *  paths. Use to chain stream N+1 after stream N. */
  onComplete?: () => void
}

export function useChronologicalReveal<E extends RevealEvent>({
  map,
  sourceId,
  events,
  enabled,
  durationMs = DEFAULT_SWEEP_DURATION_MS,
  onComplete,
}: Options<E>): void {
  // Track which event ids have been revealed by the sweep. Set ref so we can
  // dedupe O(1) without re-rendering. Also serves as the "re-reveal these"
  // list for defensive restoration after setData.
  const revealedRef = useRef<Set<string>>(new Set())
  const sweepCompleteRef = useRef(false)
  const prevEnabledRef = useRef(false)

  // RAF id in a ref — the sweep survives across events updates. The effect's
  // cleanup is what used to cancel it; now only the unmount-effect does.
  const rafRef = useRef<number | undefined>(undefined)

  // Keep onComplete in a ref so the effect doesn't re-fire when the parent
  // re-creates the callback.
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Stable refs for the sweep's loop closure — the loop reads these so it
  // doesn't capture stale values across re-renders.
  const mapRef = useRef(map)
  mapRef.current = map
  const sourceIdRef = useRef(sourceId)
  sourceIdRef.current = sourceId

  // ── Main effect — start sweep on enable, defensively re-reveal on events ─
  useEffect(() => {
    if (!map) return

    const justEnabled = enabled && !prevEnabledRef.current
    prevEnabledRef.current = enabled

    // Path 1: stream just became enabled — kick off the sweep.
    if (justEnabled) {
      if (events.length === 0) {
        sweepCompleteRef.current = true
        onCompleteRef.current?.()
        return
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (reducedMotion) {
        for (const e of events) {
          revealEvent(map, sourceId, e.id)
          revealedRef.current.add(e.id)
        }
        sweepCompleteRef.current = true
        onCompleteRef.current?.()
        return
      }

      // Sort chronologically; snapshot the array. Even if `events` gets a
      // new identity mid-sweep (sibling stream arrives), the RAF keeps
      // running against this snapshot. Newcomers are picked up by Path 2.
      const sorted = [...events].sort((a, b) => a.receivedAt - b.receivedAt)
      const oldest = sorted[0].receivedAt
      const newest = sorted[sorted.length - 1].receivedAt
      const range = Math.max(1, newest - oldest)

      let nextIdx = 0
      let startMs = 0

      const tick = (now: number) => {
        const m = mapRef.current
        const sid = sourceIdRef.current
        if (!m) return  // map disposed

        if (startMs === 0) startMs = now

        // Source may not be present yet if useMapLayer's retry-setTimeout
        // hasn't fired. Bail and retry on the next frame.
        if (!m.getSource(sid)) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }

        const progress = Math.min(1, (now - startMs) / durationMs)

        while (nextIdx < sorted.length) {
          const ev = sorted[nextIdx]
          const eventPosition = (ev.receivedAt - oldest) / range
          if (eventPosition <= progress) {
            revealEvent(m, sid, ev.id)
            revealedRef.current.add(ev.id)
            nextIdx++
          } else {
            break
          }
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          rafRef.current = undefined
          sweepCompleteRef.current = true
          onCompleteRef.current?.()
        }
      }

      rafRef.current = requestAnimationFrame(tick)
      // NO cleanup that cancels RAF. The sweep is allowed to run to
      // completion across events updates. The unmount-effect below
      // handles teardown.
      return
    }

    // Path 2: events updated mid-life. Defensively re-reveal every event
    // already in revealedRef. Picks up newcomers from polls AND restores
    // state that may have been wiped by setData.
    //
    // Run SYNCHRONOUSLY (not via rAF). Effect order — React fires effects
    // in declaration order. useMapLayer's data effect (setData) is called
    // before this hook's effect in FlowMapLayer, so by the time we get
    // here, setData has already run. Synchronous re-reveal restores any
    // state setData wiped, immediately.
    //
    // A previous attempt deferred via requestAnimationFrame, but the
    // effect's cleanup cancelled the rAF on every dep re-run — and since
    // visibleEvents in Last48UnifiedView gets a new identity on every
    // parent render (allEvents in useLast48Window isn't memoized), the
    // effect re-runs frequently, cancelling the rAF before it could fire.
    // The defensive re-reveal was never actually running.
    if (enabled) {
      for (const e of events) {
        const alreadyKnown = revealedRef.current.has(e.id)
        if (alreadyKnown || sweepCompleteRef.current) {
          revealEvent(map, sourceId, e.id)
          revealedRef.current.add(e.id)
        }
      }
    }
  }, [map, sourceId, enabled, events, durationMs])

  // ── Unmount-only cleanup ────────────────────────────────────────────────
  // The sweep RAF should survive events changes; only kill it when the
  // hook truly unmounts (component teardown). Empty deps = mount/unmount only.
  useEffect(() => {
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
    }
  }, [])
}

function revealEvent(map: mapboxgl.Map, sourceId: string, idStr: string): void {
  try {
    // Use numeric hash — Mapbox feature-state is robust for numeric IDs;
    // string IDs can be silently dropped across setData calls.
    map.setFeatureState({ source: sourceId, id: hashId(idStr) }, { revealed: true })
  } catch {
    // Feature not yet present in source — the next render's events update
    // will retry via Path 2.
  }
}
