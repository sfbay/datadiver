// src/types/heartbeat.ts
import type { TickerItem } from '@/types/ticker'
import type { AnomalyResult, DatasetId, NormalizedEvent } from '@/types/last48'

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
  /** Per-stream TRUE 48h window size, when known: the loaded count for an
   *  uncapped stream, the server count for one that hit the 5,000-row draw
   *  cap, an explicit `null` when there is no valid denominator (a capped
   *  stream whose count failed, or a stream whose full window hasn't landed
   *  yet) — rate judgments for it are withheld. A missing key (a caller that
   *  doesn't track the window) lets detectors fall back to the sample
   *  length. See src/hooks/last48Truncation.ts. */
  windowTotalByDataset?: Partial<Record<DatasetId, number | null>>
}

/** A detector is a pure function emitting candidate heartbeat items. */
export type Detector = (ctx: DetectorContext) => HeartbeatItem[]
