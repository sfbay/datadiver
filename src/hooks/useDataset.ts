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

interface UseDatasetOptions {
  /** When false, the query is not issued: the hook returns no rows and is NOT
   *  loading. For conditional sources that can't be expressed by skipping the
   *  hook call (hooks must run unconditionally) — e.g. CrimeIncidents asks the
   *  pre-2018 archive only when the selected range reaches back that far.
   *  Gating the FETCH matters, not just the render: a disabled query must cost
   *  nothing and must not register with the loading-progress meter. */
  enabled?: boolean
  /** Forwarded to `fetchDataset` — aborts a stalled request instead of
   *  holding one of the browser's ~6 per-host connection slots forever.
   *  Required for any heavy query (see useVisionZero.ts, useLast48Window.ts
   *  for the established `{ timeoutMs: 15_000, retries: 1 }` shape). */
  timeoutMs?: number
  /** Forwarded to `fetchDataset` — re-attempts on timeout/network/non-OK. */
  retries?: number
}

/** React hook for fetching Socrata dataset data with loading/error state */
export function useDataset<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  deps: unknown[] = [],
  options: UseDatasetOptions = {}
): UseDatasetResult<T> {
  const enabled = options.enabled ?? true
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  const paramsKey = JSON.stringify(params)

  const refetch = useCallback(() => {
    setRefetchKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      // Clear any rows from a previous enabled run, and settle: a disabled
      // query that stayed "loading" would hang every skeleton downstream.
      setData([])
      setError(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    const progressToken = registerQuery()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await fetchDataset<T>(datasetKey, params, {
          timeoutMs: options.timeoutMs,
          retries: options.retries,
        })
        if (!cancelled) {
          setData(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data')
        }
      } finally {
        // Unconditional (even when cancelled) — the registration was real and
        // must be matched within the same epoch, or total > completed forever.
        // Cross-view strays are filtered by the epoch token instead.
        completeQuery(progressToken)
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
  }, [datasetKey, paramsKey, refetchKey, enabled, ...deps])

  const hitLimit = !isLoading && data.length > 0 && data.length === (params.$limit ?? 1000)

  return { data, isLoading, error, hitLimit, refetch }
}
