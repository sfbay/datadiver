/** Socrata SODA API client with caching, pagination, and SoQL query building */

import type { DatasetKey } from './datasets'
import { parseRoute, type CityId } from '@/cities/routing'
import { getDatasetConfig } from '@/cities/registry'

const APP_TOKEN = import.meta.env.VITE_SOCRATA_APP_TOKEN || ''
const DEFAULT_LIMIT = 1000
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCacheKey(url: string): string {
  return url
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl })
}

/** Build a SoQL query string from parameters */
export interface SoQLParams {
  $select?: string
  $where?: string
  $order?: string
  $group?: string
  $having?: string
  $limit?: number
  $offset?: number
  $q?: string
}

function buildQueryString(params: SoQLParams): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value))
    }
  }
  return searchParams.toString()
}

/** Fetch data from a Socrata dataset.
 *
 *  `timeoutMs` aborts a stalled request so it can't hang forever (bare fetch
 *  has no timeout). `retries` re-attempts on timeout / network / non-OK with a
 *  small backoff — important on cold-load, where the per-host connection burst
 *  makes the first attempt of a heavy query slow or stall; a retry after the
 *  burst clears usually succeeds. */
/** DEV-only wrong-city tripwire: shared logical keys (policeIncidents,
 *  cases311, parkingCitations) exist in BOTH registries, so an unthreaded
 *  Oakland call silently returns SF data — no error, plausible numbers.
 *  The one-time network-walk gate protects only the initial ship; this
 *  detector is permanent. Production builds carry no check. */
export async function fetchDataset<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  options: { skipCache?: boolean; timeoutMs?: number; retries?: number; cityId?: CityId } = {}
): Promise<T[]> {
  const config = getDatasetConfig(options.cityId ?? 'sf', datasetKey)

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const routeCity = parseRoute(window.location.pathname).cityId
    if (routeCity !== 'sf' && (options.cityId ?? 'sf') === 'sf') {
      console.error(
        `[datadiver] WRONG-CITY FETCH: '${datasetKey}' resolved against SF while the route is '${routeCity}' — thread cityId (see stage-3 spec §1)`
      )
    }
  }

  // Skip default sort for aggregation queries — ordering by a non-selected field causes Socrata 400 errors
  const useDefaultSort = !params.$group && !params.$select?.match(/\b(SUM|COUNT|AVG|MIN|MAX|MEDIAN)\s*\(/i)

  const queryParams: SoQLParams = {
    ...(useDefaultSort && config.defaultSort ? { $order: config.defaultSort } : {}),
    $limit: DEFAULT_LIMIT,
    ...params,
  }

  const queryString = buildQueryString(queryParams)
  const url = `${config.endpoint}?${queryString}`
  const cacheKey = getCacheKey(url)

  // Check cache once, before the retry loop
  if (!options.skipCache) {
    const cached = getFromCache<T[]>(cacheKey)
    if (cached) return cached
  }

  // Build headers
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (APP_TOKEN) {
    headers['X-App-Token'] = APP_TOKEN
  }

  const { timeoutMs, retries = 0 } = options
  let lastErr: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = timeoutMs ? new AbortController() : undefined
    const timer = timeoutMs ? setTimeout(() => controller!.abort(), timeoutMs) : undefined
    try {
      const response = await fetch(url, { headers, signal: controller?.signal })

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limited by Socrata API. Please wait and try again.')
        }
        const errorBody = await response.text()
        throw new Error(`Socrata API error (${response.status}): ${errorBody}`)
      }

      const data = (await response.json()) as T[]
      const ttl = config.cacheTTL ?? DEFAULT_CACHE_TTL
      setCache(cacheKey, data, ttl)
      return data
    } catch (err) {
      // Normalize an abort into a clearer timeout error for surfacing.
      lastErr = err instanceof DOMException && err.name === 'AbortError'
        ? new Error(`Request timed out after ${timeoutMs}ms`)
        : err
      if (attempt < retries) {
        // Linear backoff: 400ms, 800ms, … — long enough for the cold-load
        // connection burst to drain before we re-attempt.
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
/** Clear the entire cache or a specific dataset's entries */
export function clearCache(datasetKey?: DatasetKey, cityId: CityId = 'sf'): void {
  if (!datasetKey) { cache.clear(); return }
  const config = getDatasetConfig(cityId, datasetKey)
  for (const key of cache.keys()) {
    if (key.startsWith(config.endpoint)) cache.delete(key)
  }
}
