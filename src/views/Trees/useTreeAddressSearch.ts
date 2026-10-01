// src/views/Trees/useTreeAddressSearch.ts
//
// The Explore tab's live address search (plan deviation 4: address lines are
// not in the snapshot). A PREFIX match on the inventory's `description` line
// ("1215 35th Ave | Tree 1"), at most 8 rows, debounced 250 ms, abortable
// after 8 s. Nothing is fetched until the query starts with a house number
// and a word (exploreRows.addressPrefixWhere).
//
// UNMEASURED: the query time is timed in the browser walk (plan Task 14). If
// a typical prefix takes over 1.5 s, this hook and ExploreTab's address block
// are removed together — nothing else depends on them.

import { useEffect, useMemo, useState } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { addressPrefixWhere } from './exploreRows'

export interface AddressRow {
  treeid: string
  description?: string
  species?: string
}

export interface AddressSearch {
  /** The query asks for an address (a house number and a word). */
  active: boolean
  rows: AddressRow[]
  loading: boolean
  error: string | null
}

const DEBOUNCE_MS = 250
export const ADDRESS_LIMIT = 8

export function useTreeAddressSearch(query: string): AddressSearch {
  const [debounced, setDebounced] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const where = addressPrefixWhere(debounced)
  const typedWhere = addressPrefixWhere(query)
  const params = useMemo(
    () => (where === null
      ? {}
      : { $select: 'treeid,description,species', $where: where, $order: 'description', $limit: ADDRESS_LIMIT }),
    [where],
  )
  const q = useDataset<AddressRow>('streetTrees', params, [where], { enabled: where !== null, timeoutMs: 8_000 })

  return {
    active: typedWhere !== null,
    rows: where === null ? [] : q.data,
    // Still typing toward a new prefix counts as loading, so a previous
    // prefix's rows never stand in for this one's.
    loading: typedWhere !== null && (typedWhere !== where || q.isLoading),
    error: where === null ? null : q.error,
  }
}
