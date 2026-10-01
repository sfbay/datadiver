// src/views/Trees/useTreeCard.ts
//
// The tree card's two live reads, keyed by site id (plan deviation 3: the
// card reads its row and its notices live; notice AGGREGATES stay in the
// snapshot). Both are disabled while no card is open, and both carry a
// timeout so a stalled read ends in an error with Retry, never a spinner.
//
//   streetTrees         `treeid` is a NUMBER: `treeid = 123`, unquoted. The
//                       dataset's default `$order: treeid` is valid here.
//   streetTreeRemovals  `treeid` is TEXT in two spellings ("123", "TRE-123"):
//                       both forms, quoted (noticeIdForms). Newest first.
//
// `loading` and `error` cover BOTH reads: the card shows no notice lines when
// a site has none, so a failed notice read shown as an empty list would claim
// an absence nobody measured. Mount the consumer keyed by site id — a fresh
// hook instance starts loading, so a previous site's row never flashes.

import { useCallback, useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { noticeIdForms, noticeSiteId } from '@/lib/trees/siteNotices'
import { INVENTORY_SELECT, NOTICE_SELECT, type InventoryRow, type NoticeRow } from './treeCardModel'

const LIVE = { timeoutMs: 15_000, retries: 1 } as const
const NO_PARAMS = {}

export interface TreeCardData {
  row: InventoryRow | null
  notices: NoticeRow[]
  loading: boolean
  error: string | null
  retry: () => void
}

export function useTreeCard(siteId: number | null): TreeCardData {
  const enabled = siteId !== null

  const rowParams = useMemo(
    () => (siteId === null ? NO_PARAMS : { $select: INVENTORY_SELECT, $where: `treeid = ${siteId}`, $limit: 1 }),
    [siteId],
  )
  const noticeParams = useMemo(() => {
    if (siteId === null) return NO_PARAMS
    const [a, b] = noticeIdForms(siteId)
    return { $select: NOTICE_SELECT, $where: `treeid in('${a}','${b}')`, $order: 'posteddate DESC', $limit: 20 }
  }, [siteId])

  const rowQ = useDataset<InventoryRow>('streetTrees', rowParams, [], { ...LIVE, enabled })
  const noticeQ = useDataset<NoticeRow>('streetTreeRemovals', noticeParams, [], { ...LIVE, enabled })

  // Belt and braces: only rows that name THIS site count.
  const row = rowQ.data.find((r) => Number(r.treeid) === siteId) ?? null
  const notices = useMemo(
    () => noticeQ.data.filter((n) => noticeSiteId(n.treeid) === siteId),
    [noticeQ.data, siteId],
  )

  const { refetch: refetchRow } = rowQ
  const { refetch: refetchNotices } = noticeQ
  const retry = useCallback(() => {
    refetchRow()
    refetchNotices()
  }, [refetchRow, refetchNotices])

  return {
    row,
    notices,
    loading: enabled && (rowQ.isLoading || noticeQ.isLoading),
    error: rowQ.error ?? noticeQ.error,
    retry,
  }
}
