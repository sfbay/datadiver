/** Civic data ticker types — living indicators across DataDiver */

export type TickerCategory = 'trend' | 'anomaly' | 'milestone' | 'live' | 'compliance'

export type TickerSeverity = 'positive' | 'negative' | 'neutral' | 'alert'

export type TickerSize = 'hero' | 'standard' | 'compact'

export type TickerFreshness = 'live' | 'daily' | 'weekly' | 'monthly'

export interface TickerSource {
  /** Route path, e.g. '/emergency-response' */
  view: string
  /** URL params for deep link */
  params?: Record<string, string>
  /** Human-readable label, e.g. "Emergency Response · Tenderloin" */
  label: string
  /** Socrata 4x4 dataset ID for audit trail */
  datasetId?: string
}

/** In-page click intent for heartbeat items (vs the default cross-view
 *  navigation). 'event' selects a map event; 'neighborhood' selects a
 *  neighborhood; 'none' is display-only. */
export type TickerIntent =
  | { type: 'event'; eventId: string }
  | { type: 'neighborhood'; neighborhood: string }
  | { type: 'none' }

export interface TickerItem {
  id: string

  // Content
  headline: string
  detail?: string

  // Classification
  category: TickerCategory
  severity: TickerSeverity

  // Source attribution + deep link
  source: TickerSource

  // Visual enrichment
  sparkData?: number[]
  delta?: number
  value?: string
  priorValue?: string

  // Temporal
  timestamp?: Date
  freshness: TickerFreshness
  computedAt: Date

  // Priority (higher = more important)
  priority: number
  /** True for a just-arrived high-significance item → renders a pulse. */
  breaking?: boolean
  /** In-page click intent; when set, CivicTicker's onItemClick uses it
   *  instead of navigating to source.view. */
  intent?: TickerIntent
}
