// src/lib/alerts/types.ts
// Shared across the builder UI and the API/cron. Pure types, no runtime.
import type { AlertStreamId } from './streams.js'
import type { SentIdMap } from './sentIds.js'

export type Cadence = 'hourly' | 'daily' | 'weekly'

/** Significance keys come from classifySignificant: shooting, stabbing,
 *  homicide, robbery, weapon, assault, fire. Empty array = any event on the
 *  stream (no significance filter). */
export interface SubscriptionFilters {
  streams: AlertStreamId[]
  categories: string[]
}

export interface AlertLocation {
  label?: string
  lat: number
  lng: number
}

/** The minimal shape the pure matcher needs — DB- and UI-agnostic. */
export interface MatchableSubscription {
  filters: SubscriptionFilters
  radiusMiles: number
  locations: AlertLocation[]
}

/** A full subscription as the cron sees it (DB row + joined email/locations). */
export interface DueSubscription extends MatchableSubscription {
  id: string
  subscriberId: string
  email: string
  name: string
  cadence: Cadence
  lastSentAt: number | null
  lastEventTs: number
  /** Per-stream dedup watermarks (epoch ms). Falls back to lastEventTs for
   *  rows created before the July 2026 migration — see watermarks.ts. */
  streamWatermarks: Partial<Record<string, number>>
  /** Released-tier ids already emailed (jsonb sent_event_ids) — see
   *  sentIds.ts. Live streams dedup via streamWatermarks instead. */
  sentEventIds: SentIdMap
  active: boolean
}

/** The payload the builder POSTs to /api/alerts/subscribe. */
export interface SubscriptionDraft {
  email: string
  name?: string
  cadence: Cadence
  filters: SubscriptionFilters
  radiusMiles: number
  locations: AlertLocation[]
}
