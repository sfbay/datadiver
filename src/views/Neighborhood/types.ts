/** Neighborhood Profile — cross-dataset civic pulse types */

export interface DatasetMetric {
  count: number
  priorYearCount: number
  yoyPct: number
  zScore: number
}

export interface NeighborhoodProfile {
  name: string
  centerLat: number
  centerLng: number

  emergency: DatasetMetric | null
  crime: DatasetMetric | null
  cases311: DatasetMetric | null
  crashes: DatasetMetric | null
  citations: DatasetMetric | null

  /** Average z-score across available datasets (0 = normal) */
  compositeZScore: number
  /** Datasets with |zScore| > 1 */
  anomalyCount: number
  /** Total events across all datasets */
  totalEvents: number
}

export type MetricDomain = 'emergency' | 'crime' | 'cases311' | 'crashes' | 'citations'

export type SortKey = 'name' | 'totalEvents' | 'compositeZScore' | 'anomalyCount' | MetricDomain

export const DOMAINS: { key: MetricDomain; label: string; short: string; color: string }[] = [
  { key: 'emergency', label: 'Emergency Response', short: 'ER', color: '#b85545' },
  { key: 'crime', label: 'Crime Incidents', short: 'Crime', color: '#d47149' },
  { key: 'cases311', label: '311 Cases', short: '311', color: '#3f7573' },
  { key: 'crashes', label: 'Traffic Crashes', short: 'Crash', color: '#eab308' },
  { key: 'citations', label: 'Parking Citations', short: 'Cite', color: '#5c9693' },
]

/** Fixed color slots for comparison mode */
export const SLOT_COLORS = [
  { hex: '#8b6282', name: 'purple', dashArray: '' },       // slot 0: solid
  { hex: '#8bb5b2', name: 'cyan', dashArray: '4,3' },      // slot 1: dashed
  { hex: '#9db87a', name: 'green', dashArray: '2,3' },     // slot 2: dotted
] as const

/** Cross-link routes: fingerprint axis → dataset view */
export const DOMAIN_ROUTES: Record<MetricDomain, string> = {
  emergency: '/emergency-response',
  crime: '/crime-incidents',
  cases311: '/311-cases',
  crashes: '/traffic-safety',
  citations: '/parking-citations',
}
