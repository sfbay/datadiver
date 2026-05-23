// src/types/heartbeat.ts
import type { TickerItem } from '@/types/ticker'
import type { AnomalyResult, NormalizedEvent } from '@/types/last48'

/** A ticker item plus a heartbeat-internal significance score (used for
 *  ranking; ignored by CivicTicker). */
export interface HeartbeatItem extends TickerItem {
  score: number
}

/** Inputs every detector reads. `events` are already filtered to enabled
 *  datasets and the 48h window. */
export interface DetectorContext {
  events: NormalizedEvent[]
  anomalies: AnomalyResult[]
  now: number
}

/** A detector is a pure function emitting candidate heartbeat items. */
export type Detector = (ctx: DetectorContext) => HeartbeatItem[]
