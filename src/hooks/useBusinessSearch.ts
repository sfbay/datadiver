/** Business search hook — debounced LIKE on dba_name, ownership_name, address,
 *  and certificate_number (BAN), with optional filter narrowing. Returns
 *  transformed results plus a server-side total count for UI feedback like
 *  "showing 50 of 1,247 matches".
 *
 *  Mirrors the shape of useVendorSearch so this view can later be unified
 *  with the vendor explorer if we want a shared "entity search" surface.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'

export interface BusinessSearchFilters {
  sectors?: string[]
  corridor?: string | null
  /** 'all' includes everything; the closed states distinguish voluntary vs forced */
  status?: 'all' | 'active' | 'closed' | 'admin-closed'
  /** Minimum years of operation (start-date threshold) */
  minTenureYears?: number
  parkingTax?: boolean
  hotelTax?: boolean
}

export type BusinessSortKey = 'recent' | 'tenure-desc' | 'alphabetical'

export interface BusinessSearchResult {
  uniqueid: string
  certificateNumber: string | null
  dbaName: string
  ownershipName: string
  address: string
  corridor: string | null
  sector: string
  status: 'active' | 'closed' | 'admin-closed'
  startDate: string
  endDate: string | null
  ageYears: number
}

export interface BusinessSearchReturn {
  results: BusinessSearchResult[]
  totalCount: number | null
  isLoading: boolean
  error: string | null
}

const SF_FILTER = "city = 'San Francisco'"
const DEBOUNCE_MS = 300
const SELECT_FIELDS = [
  'uniqueid',
  'certificate_number',
  'dba_name',
  'ownership_name',
  'full_business_address',
  'business_corridor',
  'naic_code_description',
  'dba_start_date',
  'dba_end_date',
  'administratively_closed',
].join(',')

export function useBusinessSearch(
  query: string,
  filters: BusinessSearchFilters = {},
  sort: BusinessSortKey = 'recent',
  limit = 50,
): BusinessSearchReturn {
  const [results, setResults] = useState<BusinessSearchResult[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const where = buildWhereClause(query, filters)
    const order = buildOrder(sort)

    setIsLoading(true)
    timerRef.current = setTimeout(() => {
      Promise.all([
        fetchDataset<BusinessLocationRecord>('businessLocations', {
          $select: SELECT_FIELDS,
          $where: where,
          $order: order,
          $limit: limit,
        }),
        fetchDataset<{ count: string }>('businessLocations', {
          $select: 'count(*) as count',
          $where: where,
        }),
      ])
        .then(([rows, countRows]) => {
          setResults(rows.map(transformRecord))
          setTotalCount(countRows[0] ? parseInt(countRows[0].count, 10) : null)
          setError(null)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Search failed')
          setResults([])
          setTotalCount(null)
        })
        .finally(() => setIsLoading(false))
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filtersKey, sort, limit])

  return { results, totalCount, isLoading, error }
}

function buildWhereClause(query: string, filters: BusinessSearchFilters): string {
  const conditions: string[] = [SF_FILTER]

  const q = query.trim()
  if (q.length >= 2) {
    const escaped = q.replace(/'/g, "''")
    const upper = escaped.toUpperCase()
    const orParts = [
      `UPPER(dba_name) LIKE '%${upper}%'`,
      `UPPER(ownership_name) LIKE '%${upper}%'`,
      `UPPER(full_business_address) LIKE '%${upper}%'`,
    ]
    // BAN exact match if query is all digits (BANs are numeric)
    if (/^\d+$/.test(q)) orParts.push(`certificate_number = '${q}'`)
    conditions.push(`(${orParts.join(' OR ')})`)
  }

  if (filters.sectors && filters.sectors.length > 0) {
    const escaped = filters.sectors.map((s) => `'${s.replace(/'/g, "''")}'`)
    conditions.push(`naic_code_description IN (${escaped.join(',')})`)
  }

  if (filters.corridor) {
    const escaped = filters.corridor.replace(/'/g, "''")
    conditions.push(`business_corridor = '${escaped}'`)
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'active') {
      conditions.push('dba_end_date IS NULL')
    } else if (filters.status === 'closed') {
      conditions.push('dba_end_date IS NOT NULL')
      conditions.push("(administratively_closed IS NULL OR UPPER(administratively_closed) != 'YES')")
    } else if (filters.status === 'admin-closed') {
      conditions.push("UPPER(administratively_closed) = 'YES'")
    }
  }

  if (filters.minTenureYears && filters.minTenureYears > 0) {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - filters.minTenureYears)
    conditions.push(`dba_start_date < '${cutoff.toISOString().split('T')[0]}'`)
  }

  if (filters.parkingTax) conditions.push('parking_tax = true')
  if (filters.hotelTax) conditions.push('transient_occupancy_tax = true')

  return conditions.join(' AND ')
}

function buildOrder(sort: BusinessSortKey): string {
  switch (sort) {
    case 'tenure-desc':
      return 'dba_start_date ASC' // earliest start = longest tenure
    case 'alphabetical':
      return 'dba_name ASC'
    case 'recent':
    default:
      return 'dba_start_date DESC'
  }
}

function transformRecord(r: BusinessLocationRecord): BusinessSearchResult {
  const startDate = new Date(r.dba_start_date)
  const endDate = r.dba_end_date ? new Date(r.dba_end_date) : new Date()
  const ageYears = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  )

  const isAdminClosed = r.administratively_closed?.trim().toLowerCase() === 'yes'
  const status: BusinessSearchResult['status'] = r.dba_end_date
    ? isAdminClosed ? 'admin-closed' : 'closed'
    : 'active'

  return {
    uniqueid: r.uniqueid,
    certificateNumber: r.certificate_number || null,
    dbaName: r.dba_name || 'Unknown',
    ownershipName: r.ownership_name || '',
    address: r.full_business_address || '',
    corridor: r.business_corridor?.trim() || null,
    sector: r.naic_code_description || 'Uncategorized',
    status,
    startDate: r.dba_start_date,
    endDate: r.dba_end_date,
    ageYears: Math.max(ageYears, 0),
  }
}
