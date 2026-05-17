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
// Reusable across views — any DataDiver surface that loads time-stamped
// point features and wants a chronological reveal instead of a bulk bloom.
// Currently consumed by FlowMapLayer for The Last 48; could naturally extend
// to Cases311, CrimeIncidents, ParkingCitations, etc.

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'

const SWEEP_DURATION_MS = 2500

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
  /** Flips false → true when the stream's initial fetch completes. The
   *  sweep fires once, on that transition. Subsequent updates to `events`
   *  (incremental polls) reveal new events immediately. */
  enabled: boolean
}

export function useChronologicalReveal<E extends RevealEvent>({
  map,
  sourceId,
  events,
  enabled,
}: Options<E>): void {
  // Track which event ids have been revealed (across the sweep and any
  // subsequent polls). A Set ref so we can dedupe O(1) without re-rendering.
  const revealedRef = useRef<Set<string>>(new Set())
  const sweepCompleteRef = useRef(false)
  const prevEnabledRef = useRef(false)

  useEffect(() => {
    if (!map) return

    const justEnabled = enabled && !prevEnabledRef.current
    prevEnabledRef.current = enabled

    // ── Path 1: stream just became enabled — kick off the sweep ─────────────
    if (justEnabled) {
      if (events.length === 0) {
        sweepCompleteRef.current = true
        return
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (reducedMotion) {
        for (const e of events) {
          revealEvent(map, sourceId, e.id)
          revealedRef.current.add(e.id)
        }
        sweepCompleteRef.current = true
        return
      }

      // Sort chronologically so the sweep advances a single pointer instead of
      // scanning every event each frame. Snapshot the array — incremental
      // polls that update `events` mid-sweep are handled by Path 2 below.
      const sorted = [...events].sort((a, b) => a.receivedAt - b.receivedAt)
      const oldest = sorted[0].receivedAt
      const newest = sorted[sorted.length - 1].receivedAt
      // Single-event or all-identical-timestamps edge: reveal at progress=0.
      const range = Math.max(1, newest - oldest)

      let nextIdx = 0
      let startMs = 0
      let rafId: number | undefined

      const tick = (now: number) => {
        // First tick establishes t0 — protects against the long pause that
        // can happen between RAF schedule and first frame on heavy loads.
        if (startMs === 0) startMs = now

        // Source may not be present yet if useMapLayer's retry-setTimeout
        // hasn't fired. Bail and retry on the next frame.
        if (!map.getSource(sourceId)) {
          rafId = requestAnimationFrame(tick)
          return
        }

        const progress = Math.min(1, (now - startMs) / SWEEP_DURATION_MS)

        while (nextIdx < sorted.length) {
          const ev = sorted[nextIdx]
          const eventPosition = (ev.receivedAt - oldest) / range
          if (eventPosition <= progress) {
            revealEvent(map, sourceId, ev.id)
            revealedRef.current.add(ev.id)
            nextIdx++
          } else {
            break
          }
        }

        if (progress < 1) {
          rafId = requestAnimationFrame(tick)
        } else {
          sweepCompleteRef.current = true
        }
      }

      rafId = requestAnimationFrame(tick)

      return () => {
        if (rafId !== undefined) cancelAnimationFrame(rafId)
      }
    }

    // ── Path 2: sweep already done — new events from polls render immediately ─
    if (sweepCompleteRef.current && enabled) {
      for (const e of events) {
        if (!revealedRef.current.has(e.id)) {
          revealEvent(map, sourceId, e.id)
          revealedRef.current.add(e.id)
        }
      }
    }
  }, [map, sourceId, enabled, events])
}

function revealEvent(map: mapboxgl.Map, sourceId: string, id: string): void {
  try {
    map.setFeatureState({ source: sourceId, id }, { revealed: true })
  } catch {
    // Feature not yet present in source — the next render's events update
    // will retry via Path 2. Acceptable: chronological sweep tolerates a
    // one-frame catch-up window.
  }
}
