import { useState, useEffect, useCallback } from 'react'
import { fetchDataset, type SoQLParams } from '@/api/client'
import type { DatasetKey } from '@/api/datasets'
import { registerQuery, completeQuery } from '@/hooks/useLoadingProgress'

interface UseDatasetResult<T> {
  data: T[]
  isLoading: boolean
  error: string | null
  hitLimit: boolean
  refetch: () => void
}

/** React hook for fetching Socrata dataset data with loading/error state */
export function useDataset<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  deps: unknown[] = []
): UseDatasetResult<T> {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  const paramsKey = JSON.stringify(params)

  const refetch = useCallback(() => {
    setRefetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    registerQuery()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await fetchDataset<T>(datasetKey, params)
        if (!cancelled) {
          setData(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data')
        }
      } finally {
        completeQuery()
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey, paramsKey, refetchKey, ...deps])

  const hitLimit = !isLoading && data.length > 0 && data.length === (params.$limit ?? 1000)

  return { data, isLoading, error, hitLimit, refetch }
}
