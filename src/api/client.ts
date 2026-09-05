/** Socrata SODA API client with caching, pagination, and SoQL query building */

import type { DatasetKey } from './datasets'
import { parseRoute, type CityId } from '@/cities/routing'
import { getDatasetConfig } from '@/cities/registry'
import type { DatasetConfig } from '@/cities/types'
import type { ViewId } from '@/cities/manifest'
import type { QueryPurpose } from '@/lib/provenance/purposes'
import { recordCitation } from '@/lib/provenance/citations'

const APP_TOKEN = import.meta.env.VITE_SOCRATA_APP_TOKEN || ''
export const DEFAULT_LIMIT = 1000
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

function getFromCache<T>(key: string): CacheEntry<T> | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry
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

export interface CiteTag { viewId: ViewId; purpose: QueryPurpose; facet?: string }
export interface ResolvedQuery { queryParams: SoQLParams; queryString: string; url: string }

/** The ONE place a request URL is built. Pure, so the citable URL can be
 *  pinned by test. Token-free by construction — the app token travels only
 *  as the X-App-Token header. */
export function resolveQuery(config: Pick<DatasetConfig, 'endpoint' | 'defaultSort'>, params: SoQLParams): ResolvedQuery {
  const useDefaultSort = !params.$group && !params.$select?.match(/\b(SUM|COUNT|AVG|MIN|MAX|MEDIAN)\s*\(/i)
  const queryParams: SoQLParams = {
    ...(useDefaultSort && config.defaultSort ? { $order: config.defaultSort } : {}),
    $limit: DEFAULT_LIMIT,
    ...params,
  }
  const queryString = buildQueryString(queryParams)
  return { queryParams, queryString, url: `${config.endpoint}?${queryString}` }
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
  options: { skipCache?: boolean; timeoutMs?: number; retries?: number; cityId?: CityId; cite?: CiteTag; citeGuard?: () => boolean } = {}
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

  const { queryParams, url } = resolveQuery(config, params)
  const cacheKey = getCacheKey(url)

  const cityId = options.cityId ?? 'sf'
  const cite = (rows: unknown[], fetchedAt: number, fromCache: boolean) => {
    if (!options.cite) return
    // A response can outlive the state that asked for it. `citeGuard` lets the
    // caller say "this request is no longer the one on screen" at the moment
    // the answer lands: useDataset passes `() => !cancelled`, the same flag
    // that already gates setData. Without it a superseded response still wrote
    // its slot, so a late arrival could hand the panel — and the COPYABLE
    // CITATION — the previous date range's filter beside a map drawn from the
    // new one, or re-add an overlay slot for a layer the reader just switched
    // off. Absent guard = record, so every untagged/unguarded caller is
    // unchanged.
    if (options.citeGuard && !options.citeGuard()) return
    recordCitation({
      cityId, viewId: options.cite.viewId, purpose: options.cite.purpose, facet: options.cite.facet,
      datasetKey, datasetId: config.id, host: new URL(config.endpoint).host,
      params: queryParams, url, fetchedAt, fromCache,
      rowCount: rows.length,
      // A $limit of 1 cannot signal truncation: the MAX() freshness probes and
      // the Last-48 count query each return exactly one row by construction, so
      // rows.length === $limit would report a cut that never happened.
      hitLimit: (queryParams.$limit ?? 0) > 1 && rows.length === queryParams.$limit,
      head: rows.slice(0, 5) as Record<string, unknown>[],
    })
  }

  // Check cache once, before the retry loop
  if (!options.skipCache) {
    const cached = getFromCache<T[]>(cacheKey)
    if (cached) {
      cite(cached.data, cached.timestamp, true)
      return cached.data
    }
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

      const json = await response.json()
      const data = (config.ext === 'geojson' && json && !Array.isArray(json) && Array.isArray(json.features)
        ? json.features   // FeatureCollection → its features (the rows)
        : json) as T[]
      if (config.ext === 'geojson' && !Array.isArray(data)) {
        // Fail loudly and specifically here — otherwise a malformed geojson
        // response flows on as a non-array and dies later as an opaque
        // "data.slice is not a function" inside the cite() call below,
        // burning the retry budget on a parse problem retries can't fix.
        throw new Error(`Socrata geojson response for '${datasetKey}' was not a FeatureCollection`)
      }
      const ttl = config.cacheTTL ?? DEFAULT_CACHE_TTL
      setCache(cacheKey, data, ttl)
      cite(data, Date.now(), false)
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
