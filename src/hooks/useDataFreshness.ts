import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import type { DatasetKey } from '@/api/datasets'

interface DataFreshnessResult {
  latestDate: string | null
  latestGeoDate: string | null
  hasDataInRange: boolean
  suggestedRange: { start: string; end: string } | null
  staleDays: number | null
  isLoading: boolean
}

/**
 * Detects data freshness for a dataset by querying MAX(dateField).
 * Returns whether the current date range has data, and a suggested range if not.
 */
export function useDataFreshness(
  datasetKey: DatasetKey,
  dateField: string,
  dateRange: { start: string; end: string },
  options?: { geoField?: string }
): DataFreshnessResult {
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [latestGeoDate, setLatestGeoDate] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const queries: Promise<void>[] = []

    // Query 1: MAX(dateField) overall
    queries.push(
      fetchDataset<{ latest: string }>(datasetKey, {
        $select: `MAX(${dateField}) as latest`,
        $limit: 1,
      }).then((rows) => {
        if (!cancelled && rows[0]?.latest) {
          setLatestDate(rows[0].latest.split('T')[0])
        }
      })
    )

    // Query 2: MAX(dateField) WHERE geoField IS NOT NULL
    if (options?.geoField) {
      queries.push(
        fetchDataset<{ latest: string }>(datasetKey, {
          $select: `MAX(${dateField}) as latest`,
          $where: `${options.geoField} IS NOT NULL`,
          $limit: 1,
        }).then((rows) => {
          if (!cancelled && rows[0]?.latest) {
            setLatestGeoDate(rows[0].latest.split('T')[0])
          }
        })
      )
    }

    Promise.all(queries)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [datasetKey, dateField, options?.geoField])

  const hasDataInRange = latestDate !== null && latestDate >= dateRange.start
  const staleDays = latestDate
    ? Math.max(0, Math.round((new Date(dateRange.end + 'T12:00:00').getTime() - new Date(latestDate + 'T12:00:00').getTime()) / 86_400_000))
    : null

  const suggestedRange = (latestDate && !hasDataInRange)
    ? (() => {
        const end = new Date(latestDate + 'T12:00:00')
        const start = new Date(end.getTime() - 30 * 86_400_000)
        return {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        }
      })()
    : null

  return { latestDate, latestGeoDate, hasDataInRange, suggestedRange, staleDays, isLoading }
}
