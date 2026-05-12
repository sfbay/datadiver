// src/types/last48.ts
//
// Shared types for The Last 48 view. The DatasetId union is the set of
// datasets eligible for the 48h sliding window — explicitly excludes
// archive-tier datasets (Traffic Crashes, Fire Incidents) and the
// broken-data Parking Citations dataset.

export type DatasetId =
  | '911-realtime'        // gnap-fj3t — Tier 1, freshest
  | 'fire-ems-dispatch'   // nuek-vuh3
  | '311-cases'           // vw6y-z8j6
  | '911-historical'      // 2zdj-bwza
  | 'parking-revenue'     // imvp-dq3v
  | 'police-incidents'    // wg3w-h783 — Tier 2 (off by default)

export type EventTier = 'tier1' | 'tier2'

export const TIER_1_DATASETS: DatasetId[] = [
  '911-realtime',
  'fire-ems-dispatch',
  '311-cases',
  '911-historical',
  'parking-revenue',
]

export const TIER_2_DATASETS: DatasetId[] = ['police-incidents']

export const ALL_LAST48_DATASETS: DatasetId[] = [
  ...TIER_1_DATASETS,
  ...TIER_2_DATASETS,
]

/** Normalized event shape — every dataset's raw rows are mapped to this. */
export interface NormalizedEvent {
  id: string                          // datasetId + native row id, globally unique
  datasetId: DatasetId
  timestamp: string                   // ISO datetime — the dataset's "received" or "issued" time
  receivedAt: number                  // unix ms (for sorting)
  neighborhood?: string               // SF Analysis Boundary, if available
  longitude?: number
  latitude?: number
  callType?: string                   // dataset-specific category
  headline?: string                   // human-readable one-line summary
  raw: Record<string, unknown>        // original Socrata row, for detail panels
}

/** Freshness map per dataset — drives the chip strip. */
export interface DatasetFreshness {
  rowsUpdatedAt: number | null        // unix ms; null = unknown / errored
  maxEventTime: number | null         // unix ms of freshest event in dataset
  eventLagMs: number | null           // now - maxEventTime (computed on read)
  refreshLagMs: number | null         // now - rowsUpdatedAt
  error: string | null                // last fetch error message, if any
}

export type FreshnessMap = Record<DatasetId, DatasetFreshness>

/** Anomaly result per (neighborhood × dataset) for HOTSPOTS mode. */
export interface AnomalyResult {
  neighborhood: string
  datasetId: DatasetId | 'combined'   // 'combined' = weighted across enabled datasets
  count48h: number                     // current 48h count
  baselineMean: number                 // mean of trailing 12-week 48h windows
  baselineSd: number                   // std dev of those windows
  zScore: number                       // (count48h - baselineMean) / baselineSd
}
