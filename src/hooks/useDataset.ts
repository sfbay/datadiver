import { useState, useEffect, useCallback } from 'react'
import { fetchDataset, DEFAULT_LIMIT, type SoQLParams, type CiteTag } from '@/api/client'
import type { DatasetKey } from '@/api/datasets'
import { registerQuery, completeQuery } from '@/hooks/useLoadingProgress'
import { useRouteView } from '@/cities/useActiveCity'
import type { CityId } from '@/cities/routing'
import { clearCitationSlot } from '@/lib/provenance/citations'

interface UseDatasetResult<T> {
  data: T[]
  isLoading: boolean
  error: string | null
  hitLimit: boolean
  refetch: () => void
}

// cityId defaults to the ROUTE-DERIVED city (stage 3): an SF view mounted on
// an SF route and an Oakland view on /oakland/* both get the right registry
// with zero call-site churn. Pass cityId explicitly only for a deliberate
// cross-city fetch (none exist today).
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
  cityId?: CityId
  /** Identity metadata for the citation recorder — NOT a query input, so it
   *  is deliberately absent from the effect's dependency array below. */
  cite?: CiteTag
}

/** React hook for fetching Socrata dataset data with loading/error state */
export function useDataset<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  deps: unknown[] = [],
  options: UseDatasetOptions = {}
): UseDatasetResult<T> {
  const enabled = options.enabled ?? true
  const routeCityId = useRouteView().cityId
  const cityId = options.cityId ?? routeCityId
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
      // A disabled query is no longer behind anything on screen — the
      // citation pill must stop citing whatever it recorded while this
      // query was last enabled, or it keeps showing a query for a layer the
      // reader just turned off.
      if (options.cite) {
        clearCitationSlot(cityId, options.cite.viewId, options.cite.purpose, datasetKey, options.cite.facet)
      }
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
          cityId,
          cite: options.cite,
          // The citation slot obeys the same cancellation the rows do. A
          // superseded response (date range moved, layer toggled off) must
          // not write its query into the pill after a newer one already has.
          citeGuard: () => !cancelled,
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
  }, [datasetKey, paramsKey, refetchKey, enabled, cityId, ...deps])

  // A $limit of 1 cannot signal truncation — see the matching comment on
  // fetchDataset's own hitLimit in src/api/client.ts. Keep the two formulas
  // in agreement.
  const effectiveLimit = params.$limit ?? DEFAULT_LIMIT
  const hitLimit = !isLoading && effectiveLimit > 1 && data.length > 0 && data.length === effectiveLimit

  return { data, isLoading, error, hitLimit, refetch }
}
