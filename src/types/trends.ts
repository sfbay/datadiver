import type { DatasetKey } from '@/api/datasets'

export interface TrendConfig {
  datasetKey: DatasetKey
  dateField: string
  neighborhoodField?: string
  metrics?: { selectExpr: string; alias: string; label: string; format: (v: number) => string }[]
  baseWhere?: string
}

export interface PeriodDataPoint {
  period: string
  periodLabel: string
  count: number
  metrics: Record<string, number>
}

export interface NeighborhoodTrendStats {
  neighborhood: string
  currentCount: number
  priorYearCount: number
  yoyPct: number
  zScore: number
  metrics: Record<string, { current: number; priorYear: number; pct: number }>
}

export type PeriodGranularity = 'daily' | 'weekly' | 'monthly'

export interface TrendBaselineResult {
  neighborhoods: NeighborhoodTrendStats[]
  neighborhoodMap: Map<string, NeighborhoodTrendStats>
  currentPeriods: PeriodDataPoint[]
  priorYearPeriods: PeriodDataPoint[]
  granularity: PeriodGranularity
  cityWideYoY: { current: number; priorYear: number; pct: number } | null
  isLoading: boolean
}
