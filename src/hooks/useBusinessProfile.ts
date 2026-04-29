/** useBusinessProfile — fans out four parallel Socrata queries to build a
 *  full dossier for a single business:
 *    1. The business itself (by uniqueid)
 *    2. Sibling locations (same BAN, other uniqueids)
 *    3. Same-owner other businesses (same ownership_name, different BAN)
 *    4. Same-address neighbors (same full_business_address, different uniqueid)
 *
 *  All four can run concurrently because they're keyed off the primary
 *  record's fields. The hook waits for all to settle before returning a
 *  combined `isLoading: false`.
 */

import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'

export interface BusinessProfileData {
  business: BusinessLocationRecord | null
  /** Other locations under the same BAN (excludes self). Empty if not in a chain. */
  siblingLocations: BusinessLocationRecord[]
  /** Businesses with same ownership_name but a DIFFERENT BAN. Excludes self
   *  and excludes siblings (those are already in `siblingLocations`). Empty
   *  for sole-proprietors or when owner name doesn't match anything else. */
  ownerOtherBusinesses: BusinessLocationRecord[]
  /** Other businesses (any time) at the same physical address. Useful as a
   *  turnover/vacancy proxy. Excludes self. */
  addressNeighbors: BusinessLocationRecord[]
}

export interface BusinessProfileReturn extends BusinessProfileData {
  isLoading: boolean
  error: string | null
}

const SF_FILTER = "city = 'San Francisco'"

export function useBusinessProfile(uniqueid: string | undefined): BusinessProfileReturn {
  const [data, setData] = useState<BusinessProfileData>({
    business: null,
    siblingLocations: [],
    ownerOtherBusinesses: [],
    addressNeighbors: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!uniqueid) {
      setData({ business: null, siblingLocations: [], ownerOtherBusinesses: [], addressNeighbors: [] })
      setIsLoading(false)
      return
    }
    cancelRef.current = false
    setIsLoading(true)
    setError(null)

    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `uniqueid = '${uniqueid.replace(/'/g, "''")}'`,
      $limit: 1,
    })
      .then(async (rows) => {
        if (cancelRef.current) return
        if (!rows[0]) {
          setData({ business: null, siblingLocations: [], ownerOtherBusinesses: [], addressNeighbors: [] })
          setError('Business not found')
          setIsLoading(false)
          return
        }
        const biz = rows[0]
        setData((prev) => ({ ...prev, business: biz }))

        // Fan out the three context queries in parallel. None block on each
        // other; the page can show identity facts while these resolve.
        const [siblings, ownerOther, addressNeighbors] = await Promise.all([
          fetchSiblings(biz, uniqueid),
          fetchOwnerOther(biz, uniqueid),
          fetchAddressNeighbors(biz, uniqueid),
        ])
        if (cancelRef.current) return
        setData({
          business: biz,
          siblingLocations: siblings,
          ownerOtherBusinesses: ownerOther,
          addressNeighbors,
        })
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to load')
        setIsLoading(false)
      })

    return () => { cancelRef.current = true }
  }, [uniqueid])

  return { ...data, isLoading, error }
}

async function fetchSiblings(biz: BusinessLocationRecord, selfUniqueid: string): Promise<BusinessLocationRecord[]> {
  if (!biz.certificate_number) return []
  try {
    const rows = await fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `${SF_FILTER} AND certificate_number = '${biz.certificate_number.replace(/'/g, "''")}' AND uniqueid != '${selfUniqueid.replace(/'/g, "''")}'`,
      $order: 'dba_start_date ASC',
      $limit: 50,
    })
    return rows
  } catch {
    return []
  }
}

async function fetchOwnerOther(biz: BusinessLocationRecord, selfUniqueid: string): Promise<BusinessLocationRecord[]> {
  if (!biz.ownership_name?.trim()) return []
  try {
    const escaped = biz.ownership_name.replace(/'/g, "''")
    const banClause = biz.certificate_number
      ? ` AND certificate_number != '${biz.certificate_number.replace(/'/g, "''")}'`
      : ''
    const rows = await fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `${SF_FILTER} AND ownership_name = '${escaped}' AND uniqueid != '${selfUniqueid.replace(/'/g, "''")}'${banClause}`,
      $order: 'dba_start_date ASC',
      $limit: 30,
    })
    return rows
  } catch {
    return []
  }
}

async function fetchAddressNeighbors(biz: BusinessLocationRecord, selfUniqueid: string): Promise<BusinessLocationRecord[]> {
  if (!biz.full_business_address?.trim()) return []
  try {
    const escaped = biz.full_business_address.replace(/'/g, "''")
    const rows = await fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `${SF_FILTER} AND full_business_address = '${escaped}' AND uniqueid != '${selfUniqueid.replace(/'/g, "''")}'`,
      $order: 'dba_start_date DESC',
      $limit: 30,
    })
    return rows
  } catch {
    return []
  }
}
