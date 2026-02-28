/** Socrata SODA API client with caching, pagination, and SoQL query building */

import { DATASETS, type DatasetKey } from './datasets'

const APP_TOKEN = import.meta.env.VITE_SOCRATA_APP_TOKEN || ''
const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 50_000
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

/** Fetch data from a Socrata dataset */
export async function fetchDataset<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  options: { skipCache?: boolean } = {}
): Promise<T[]> {
  const config = DATASETS[datasetKey]
  if (!config) throw new Error(`Unknown dataset: ${datasetKey}`)

  const queryParams: SoQLParams = {
    $order: config.defaultSort,
    $limit: DEFAULT_LIMIT,
    ...params,
  }

  const queryString = buildQueryString(queryParams)
  const url = `${config.endpoint}?${queryString}`
  const cacheKey = getCacheKey(url)

  // Check cache
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

  const response = await fetch(url, { headers })

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited by Socrata API. Please wait and try again.')
    }
    const errorBody = await response.text()
    throw new Error(`Socrata API error (${response.status}): ${errorBody}`)
  }

  const data = (await response.json()) as T[]

  // Cache the result
  const ttl = config.cacheTTL ?? DEFAULT_CACHE_TTL
  setCache(cacheKey, data, ttl)

  return data
}

/** Fetch all pages of a dataset (auto-paginate) */
export async function fetchAllPages<T>(
  datasetKey: DatasetKey,
  params: SoQLParams = {},
  maxRecords: number = MAX_LIMIT
): Promise<T[]> {
  const pageSize = Math.min(params.$limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const allData: T[] = []
  let offset = params.$offset ?? 0

  while (allData.length < maxRecords) {
    const pageParams: SoQLParams = {
      ...params,
      $limit: pageSize,
      $offset: offset,
    }

    const page = await fetchDataset<T>(datasetKey, pageParams, { skipCache: true })
    allData.push(...page)

    if (page.length < pageSize) break // Last page
    offset += pageSize
  }

  return allData.slice(0, maxRecords)
}

/** Fetch aggregated data (using $group and aggregate functions) */
export async function fetchAggregation<T>(
  datasetKey: DatasetKey,
  select: string,
  group: string,
  where?: string,
  order?: string,
  limit?: number
): Promise<T[]> {
  return fetchDataset<T>(datasetKey, {
    $select: select,
    $group: group,
    $where: where,
    $order: order ?? `count(*) DESC`,
    $limit: limit ?? 1000,
  })
}

/** Clear the entire cache or a specific dataset's entries */
export function clearCache(datasetKey?: DatasetKey): void {
  if (!datasetKey) {
    cache.clear()
    return
  }
  const config = DATASETS[datasetKey]
  for (const key of cache.keys()) {
    if (key.includes(config.id)) {
      cache.delete(key)
    }
  }
}
