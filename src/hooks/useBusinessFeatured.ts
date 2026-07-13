/** useBusinessFeatured — fires three parallel server-side queries to populate
 *  the empty state of the BusinessSearch landscape:
 *    1. SF's oldest active businesses (still open, earliest start date)
 *    2. Notable recent closures (closed in the last 365 days, longest tenure)
 *    3. Biggest chains by location count (server-side BAN aggregation)
 *
 *  Module-level cache (60-min TTL) keeps the empty state instant on
 *  repeat visits — these results don't change minute-to-minute.
 */

import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { naicsSector } from '@/utils/naicsSector'

export interface FeaturedBusiness {
  uniqueid: string
  dbaName: string
  ownershipName: string
  address: string
  startDate: string
  endDate: string | null
  ageYears: number
  certificateNumber: string | null
  sector: string
}

export interface FeaturedChain {
  ban: string
  primaryDba: string
  locationCount: number
}

export interface FeaturedCollections {
  oldestActive: FeaturedBusiness[]
  recentClosures: FeaturedBusiness[]
  biggestChains: FeaturedChain[]
}

export interface FeaturedReturn extends FeaturedCollections {
  isLoading: boolean
  error: string | null
}

const SF_FILTER = "city = 'San Francisco'"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  data: FeaturedCollections
  ts: number
}
let cache: CacheEntry | null = null

const SELECT_FIELDS = [
  'uniqueid',
  'certificate_number',
  'dba_name',
  'ownership_name',
  'full_business_address',
  'self_reported_naics_code',
  'dba_start_date',
  'dba_end_date',
].join(',')

export function useBusinessFeatured(): FeaturedReturn {
  const [data, setData] = useState<FeaturedCollections>(
    cache && Date.now() - cache.ts < CACHE_TTL_MS
      ? cache.data
      : { oldestActive: [], recentClosures: [], biggestChains: [] },
  )
  const [isLoading, setIsLoading] = useState(!cache || Date.now() - cache.ts >= CACHE_TTL_MS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return

    let cancelled = false
    setIsLoading(true)

    const closureCutoff = new Date()
    closureCutoff.setDate(closureCutoff.getDate() - 365)
    const cutoffStr = closureCutoff.toISOString().split('T')[0]

    // Long-tenure cutoff for "notable" closures: must have been open at least 5y
    const longTenureCutoff = new Date()
    longTenureCutoff.setFullYear(longTenureCutoff.getFullYear() - 5)
    const longTenureStr = longTenureCutoff.toISOString().split('T')[0]

    Promise.all([
      // 1. Oldest active businesses
      fetchDataset<BusinessLocationRecord>('businessLocations', {
        $select: SELECT_FIELDS,
        $where: `${SF_FILTER} AND dba_end_date IS NULL AND dba_start_date IS NOT NULL`,
        $order: 'dba_start_date ASC',
        $limit: 10,
      }),
      // 2. Recent notable closures (long-tenured businesses closed in last 365d)
      fetchDataset<BusinessLocationRecord>('businessLocations', {
        $select: SELECT_FIELDS,
        $where: `${SF_FILTER} AND dba_end_date >= '${cutoffStr}' AND dba_start_date < '${longTenureStr}'`,
        $order: 'dba_start_date ASC', // oldest start = longest tenure → most notable
        $limit: 10,
      }),
      // 3. Biggest chains by location count
      fetchDataset<{ certificate_number: string; cnt: string; dba_name: string }>('businessLocations', {
        $select: 'certificate_number, count(*) as cnt, max(dba_name) as dba_name',
        $where: `${SF_FILTER} AND certificate_number IS NOT NULL`,
        $group: 'certificate_number',
        $order: 'cnt DESC',
        $limit: 10,
      }),
    ])
      .then(([oldestRows, closureRows, chainRows]) => {
        if (cancelled) return
        const collections: FeaturedCollections = {
          oldestActive: oldestRows.map(transformBusiness),
          recentClosures: closureRows.map(transformBusiness),
          biggestChains: chainRows
            .filter((r) => r.certificate_number)
            .map((r) => ({
              ban: r.certificate_number,
              primaryDba: r.dba_name || `BAN ${r.certificate_number}`,
              locationCount: parseInt(r.cnt, 10) || 0,
            })),
        }
        cache = { data: collections, ts: Date.now() }
        setData(collections)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load featured collections')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { ...data, isLoading, error }
}

function transformBusiness(r: BusinessLocationRecord): FeaturedBusiness {
  const start = new Date(r.dba_start_date)
  const end = r.dba_end_date ? new Date(r.dba_end_date) : new Date()
  const ageYears = Math.floor((end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  return {
    uniqueid: r.uniqueid,
    dbaName: r.dba_name || 'Unknown',
    ownershipName: r.ownership_name || '',
    address: r.full_business_address || '',
    startDate: r.dba_start_date,
    endDate: r.dba_end_date,
    ageYears: Math.max(ageYears, 0),
    certificateNumber: r.certificate_number || null,
    sector: naicsSector(r.self_reported_naics_code),
  }
}
