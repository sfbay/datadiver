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
  return useMemo(() => {
    const enabled = events.filter((e) => datasets.includes(e.datasetId))
    const now = Date.now()
    const raw = DETECTORS.flatMap((d) => d({ events: enabled, anomalies, now }))
    const ranked = rankHeartbeatItems(raw)
    return ranked.length > 0 ? ranked : [quietFallback(now)]
  }, [events, anomalies, datasets])
}
