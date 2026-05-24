// src/hooks/useLast48Heartbeat.ts
//
// The Last 48 "civic heartbeat" — derived state, not a data source. Runs the
// detector registry over in-memory events + anomaly z-scores, ranks the
// result, and returns ticker items. No network. See spec
// 2026-05-22-last48-heartbeat-ticker-design.md.

import { useMemo } from 'react'
import type { AnomalyResult, DatasetId, NormalizedEvent } from '@/types/last48'
import type { HeartbeatItem } from '@/types/heartbeat'
import { DETECTORS } from '@/views/Last48/heartbeat/detectors'
import { rankHeartbeatItems, quietFallback } from '@/views/Last48/heartbeat/rank'

export function useLast48Heartbeat(opts: {
  events: NormalizedEvent[]
  anomalies: AnomalyResult[]
  datasets: DatasetId[]
}): HeartbeatItem[] {
  const { events, anomalies, datasets } = opts
  // NOTE: `events` (window48.events) and `anomalies` are fresh array refs on
  // every render, so this memo recomputes each render rather than caching —
  // by design. `now = Date.now()` lives INSIDE, which is what keeps the
  // "X minutes ago" copy and the `breaking` flag current as the clock moves.
  // Detector cost is O(events) (~a few ms over the 48h window). Do NOT
  // "stabilize" these deps to make the memo cache: that would freeze the
  // relative-time copy between window updates. If you ever need to, drive
  // freshness from a periodic tick (e.g. a 30-60s interval) instead.
  return useMemo(() => {
    const enabled = events.filter((e) => datasets.includes(e.datasetId))
    const now = Date.now()
    const raw = DETECTORS.flatMap((d) => d({ events: enabled, anomalies, now }))
    const ranked = rankHeartbeatItems(raw)
    return ranked.length > 0 ? ranked : [quietFallback(now)]
  }, [events, anomalies, datasets])
}
