/** Civic Data Ticker — type definitions for the living indicator system. */

export type TickerCategory = 'trend' | 'anomaly' | 'milestone' | 'live' | 'compliance'
export type TickerSeverity = 'positive' | 'negative' | 'neutral' | 'alert'
export type TickerSize = 'hero' | 'standard' | 'compact'

export interface TickerItem {
  id: string

  // Content
  headline: string              // "Tenderloin 911 Response: +23% YoY"
  detail?: string               // "Avg 6.2 min vs 5.0 min prior year"

  // Classification
  category: TickerCategory
  severity: TickerSeverity

  // Source attribution + deep link
  source: {
    view: string                // route: '/emergency-response'
    params?: Record<string, string>
    label: string               // "Emergency Response · Tenderloin"
    datasetId?: string          // Socrata 4x4 for audit trail
  }

  // Visual enrichment
  sparkData?: number[]          // 6-12 point mini trend
  delta?: number                // % change (positive = up)
  value?: string                // current value: "6.2 min", "$2.1M"
  priorValue?: string           // comparison: "5.0 min", "$1.8M"

  // Temporal
  timestamp?: Date
  freshness: 'live' | 'daily' | 'weekly' | 'monthly'
  computedAt: Date

  // Priority — higher = more important
  priority: number
}
