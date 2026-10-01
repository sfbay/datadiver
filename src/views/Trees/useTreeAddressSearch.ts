// src/views/Trees/useTreeAddressSearch.ts
//
// The Explore tab's live address search (plan deviation 4: address lines are
// not in the snapshot). A PREFIX match on the inventory's `description` line
// ("1215 35th Ave | Tree 1"), at most 8 rows, debounced 250 ms, abortable
// after 8 s. Nothing is fetched until the query starts with a house number
// and a word (exploreRows.addressPrefixWhere). Rows show only for the query
// they are stamped with (exploreRows.addressSearchState).
//
// UNMEASURED: the query time is timed in the browser walk (plan Task 14). If
// a typical prefix takes over 1.5 s, this hook and ExploreTab's address block
// are removed together — nothing else depends on them.

import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { useRouteView } from '@/cities/useActiveCity'
import { completeQuery, registerQuery } from '@/hooks/useLoadingProgress'
import { addressPrefixWhere, addressSearchState, type StampedRead } from './exploreRows'

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
  const cityId = useRouteView().cityId
  const [debounced, setDebounced] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const where = addressPrefixWhere(debounced)
  const typedWhere = addressPrefixWhere(query)

  // One direct read per `where`, its result STAMPED with that `where` (the
  // useTreeCard pattern). Never infer "settled" from having seen a loading
  // frame: fetchDataset answers a repeated query from its cache in a
  // microtask, React batches that with the request's start, and no render
  // ever shows loading — the stamp arrives with the rows instead.
  const [settled, setSettled] = useState<StampedRead<AddressRow> | null>(null)
  useEffect(() => {
    if (where === null) return
    let cancelled = false
    const token = registerQuery()
    fetchDataset<AddressRow>(
      'streetTrees',
      { $select: 'treeid,description,species', $where: where, $order: 'description', $limit: ADDRESS_LIMIT },
      { timeoutMs: 8_000, cityId },
    )
      .then((rows) => { if (!cancelled) setSettled({ where, rows, error: null }) })
      .catch((err: unknown) => {
        if (!cancelled) setSettled({ where, rows: [], error: err instanceof Error ? err.message : 'Failed to fetch data' })
      })
      .finally(() => completeQuery(token))
    return () => { cancelled = true }
  }, [where, cityId])

  return { active: typedWhere !== null, ...addressSearchState(typedWhere, where, settled) }
}
