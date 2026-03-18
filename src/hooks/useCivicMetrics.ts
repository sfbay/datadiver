// src/hooks/useCivicMetrics.ts
// Fetches a single civic metric (crime count, 311 cases, etc.) aggregated by
// neighborhood for the Census Explorer scatter plot Y-axis.

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '../api/client'
import { DATASETS } from '../api/datasets'
import type { DatasetKey } from '../api/datasets'
import { useAppStore } from '../stores/appStore'
import { CIVIC_METRICS } from '../utils/censusVariables'

export interface CivicMetricResult {
  data: Map<string, number>  // neighborhood name → metric value
  isLoading: boolean
  error: string | null
}

/**
 * Fetch a single civic metric aggregated by neighborhood for the current date range.
 * Uses Socrata GROUP BY queries.
 *
 * @param metricKey - Key from CIVIC_METRICS, or null to return empty immediately.
 */
export function useCivicMetric(metricKey: string | null): CivicMetricResult {
  const dateRange = useAppStore(state => state.dateRange)

  const [data, setData] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Abort reference — incrementing this invalidates in-flight responses
  const abortIdRef = useRef(0)

  useEffect(() => {
    // 1. Null metricKey → nothing to fetch
    if (!metricKey) {
      setData(new Map())
      setIsLoading(false)
      setError(null)
      return
    }

    // 2. Look up config
    const config = CIVIC_METRICS.find(m => m.key === metricKey)
    if (!config) {
      setData(new Map())
      setIsLoading(false)
      setError(`Unknown metric key: ${metricKey}`)
      return
    }

    // 3. Client-side metrics are deferred — return empty for now
    if (config.isClientSide) {
      setData(new Map())
      setIsLoading(false)
      setError(null)
      return
    }

    // 4. Resolve the dataset's dateField from DATASETS
    const datasetConfig = DATASETS[config.datasetKey as DatasetKey]
    if (!datasetConfig) {
      setData(new Map())
      setIsLoading(false)
      setError(`Unknown dataset key: ${config.datasetKey}`)
      return
    }

    // 5. Kick off fetch
    const currentAbortId = ++abortIdRef.current
    setIsLoading(true)
    setError(null)

    const fetchMetric = async () => {
      try {
        // Build WHERE clause — only apply date filter if the dataset has a dateField
        let where: string | undefined
        if (datasetConfig.dateField) {
          where = `${datasetConfig.dateField} >= '${dateRange.start}T00:00:00' AND ${datasetConfig.dateField} <= '${dateRange.end}T23:59:59'`
        }

        const rows = await fetchDataset<Record<string, string>>(
          config.datasetKey as DatasetKey,
          {
            $select: config.selectClause,
            $where: where,
            $group: config.neighborhoodField,
            $limit: 50,
          }
        )

        // Guard against stale responses
        if (currentAbortId !== abortIdRef.current) return

        // 6. Parse results into Map<neighborhoodName, value>
        const result = new Map<string, number>()
        for (const row of rows) {
          const neighborhood = row[config.neighborhoodField]
          const rawValue = row['value']
          if (neighborhood && rawValue !== undefined && rawValue !== null) {
            const value = parseFloat(rawValue)
            if (!isNaN(value)) {
              result.set(neighborhood, value)
            }
          }
        }

        setData(result)
        setIsLoading(false)
      } catch (err) {
        if (currentAbortId !== abortIdRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to fetch civic metric')
        setData(new Map())
        setIsLoading(false)
      }
    }

    fetchMetric()
  }, [metricKey, dateRange.start, dateRange.end])

  return { data, isLoading, error }
}
