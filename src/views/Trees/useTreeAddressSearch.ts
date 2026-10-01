// src/views/Trees/useTreeAddressSearch.ts
//
// The Explore tab's live address search (plan deviation 4: address lines are
// not in the snapshot). A PREFIX match on the inventory's `description` line
// ("1215 35th Ave | Tree 1"), at most 8 rows, debounced 250 ms, abortable
// after 8 s. Nothing is fetched until the query starts with a house number
// and a word (exploreRows.addressPrefixWhere). Rows show only for the query
// they were fetched for (exploreRows.addressSearchLoading).
//
// UNMEASURED: the query time is timed in the browser walk (plan Task 14). If
// a typical prefix takes over 1.5 s, this hook and ExploreTab's address block
// are removed together — nothing else depends on them.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { addressPrefixWhere, addressSearchLoading } from './exploreRows'

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

  // Which `where` the held rows (or error) belong to. useDataset always
  // flips `isLoading` on in an effect after the params change, so: a request
  // seen loading for `where`, then settled, makes `where` the holder. Until
  // then the rows on hand are an earlier query's, and the search is loading.
  const [heldFor, setHeldFor] = useState<string | null>(null)
  const sawLoadingFor = useRef<string | null>(null)
  useEffect(() => {
    if (where === null) {
      sawLoadingFor.current = null
      setHeldFor(null)
      return
    }
    if (q.isLoading) sawLoadingFor.current = where
    else if (sawLoadingFor.current === where) setHeldFor(where)
  }, [where, q.isLoading])

  const loading = addressSearchLoading({ typed: typedWhere, debounced: where, heldFor, fetching: q.isLoading })
  const settled = where !== null && !loading
  return {
    active: typedWhere !== null,
    rows: settled ? q.data : [],
    loading,
    error: settled ? q.error : null,
  }
}
