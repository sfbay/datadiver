// src/views/Trees/useTreeCard.ts
//
// The tree card's two live reads, keyed by site id (plan deviation 3: the
// card reads its row and its notices live; notice AGGREGATES stay in the
// snapshot). Both carry a timeout so a stalled read ends in an error with
// Retry, never a spinner. The `$where` builders are pure and pinned
// (treeCardModel.ts): the inventory id is UNQUOTED (a NUMBER column), the
// notice ids are both TEXT spellings, quoted.
//
// Why not two useDataset calls: useDataset cannot say WHICH params its rows
// answer, and a cached read can settle without ever rendering isLoading, so
// the render between an id change and the re-request would show the previous
// site's rows (or its empty result — read as "left the inventory") as this
// one's. This hook records the site id and attempt each read was ISSUED for,
// and readBelongsTo (pure, tested) reports loading until they match.
//
// `loading` and `error` cover BOTH reads, settled together: the card shows
// no notice lines when a site has none, so a failed notice read shown as an
// empty list would claim an absence nobody measured.

import { useCallback, useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { useRouteView } from '@/cities/useActiveCity'
import { completeQuery, registerQuery } from '@/hooks/useLoadingProgress'
import {
  INVENTORY_SELECT, NOTICE_SELECT, inventoryWhere, noticesWhere, readBelongsTo, rowsForSite,
  type InventoryRow, type NoticeRow, type SettledRead,
} from './treeCardModel'

const LIVE = { timeoutMs: 15_000, retries: 1 } as const

export interface TreeCardData {
  row: InventoryRow | null
  notices: NoticeRow[]
  loading: boolean
  error: string | null
  retry: () => void
}

const NONE: NoticeRow[] = []

export function useTreeCard(siteId: number | null): TreeCardData {
  const cityId = useRouteView().cityId
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<SettledRead | null>(null)

  useEffect(() => {
    if (siteId === null) return
    let cancelled = false
    const token = registerQuery()
    const opts = { ...LIVE, cityId }
    Promise.all([
      fetchDataset<InventoryRow>('streetTrees', { $select: INVENTORY_SELECT, $where: inventoryWhere(siteId), $limit: 1 }, opts),
      fetchDataset<NoticeRow>(
        'streetTreeRemovals',
        { $select: NOTICE_SELECT, $where: noticesWhere(siteId), $order: 'posteddate DESC', $limit: 20 },
        opts,
      ),
    ])
      .then(([rows, notices]) => {
        if (!cancelled) setSettled({ forId: siteId, attempt, rows, notices, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSettled({ forId: siteId, attempt, rows: [], notices: [], error: err instanceof Error ? err.message : 'Failed to fetch data' })
        }
      })
      .finally(() => completeQuery(token))
    return () => { cancelled = true }
  }, [siteId, attempt, cityId])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  if (siteId === null) return { row: null, notices: NONE, loading: false, error: null, retry }
  if (!readBelongsTo(siteId, attempt, settled)) return { row: null, notices: NONE, loading: true, error: null, retry }
  return { ...rowsForSite(siteId, settled), loading: false, error: settled.error, retry }
}
