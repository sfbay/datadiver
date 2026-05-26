// src/lib/alerts/types.ts
// Shared across the builder UI and the API/cron. Pure types, no runtime.
import type { DatasetId } from '@/types/last48'

export type Cadence = 'hourly' | 'daily' | 'weekly'

/** Significance keys come from classifySignificant: shooting, stabbing,
 *  homicide, robbery, weapon, assault, fire. Empty array = any event on the
 *  stream (no significance filter). */
export interface SubscriptionFilters {
  streams: DatasetId[]
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
