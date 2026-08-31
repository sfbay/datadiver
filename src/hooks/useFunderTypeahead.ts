// Live ⌘K funder rows (spec §3.2). Debounced 250ms, fires only while the
// palette is open, an SF funder dialect is available, and the folded query
// is at least 3 characters — a shorter query would match too broadly and
// isn't worth a request. A generation counter (same pattern as
// useFunderProfile) drops a response for a query the user has since changed
// or cleared. Any failure — including a debounce-window navigate-away — is
// silent: the static ⌘K index still works with no funder rows appended.
import { useEffect, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { fold } from '@/lib/funders/funderKey'
import type { FunderBuilders } from '@/views/CampaignFinance/fppcDialect'

export interface TypeaheadRow {
  transaction_first_name?: string
  transaction_last_name: string
  entity_code?: string
  city?: string
  gifts: string
  total: string
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 3
const TYPEAHEAD_FETCH_OPTS = { cityId: 'sf' as const, timeoutMs: 6_000, retries: 0 }

export function useFunderTypeahead(
  query: string,
  active: boolean,
  builders: FunderBuilders | null
): { rows: TypeaheadRow[] } {
  const [rows, setRows] = useState<TypeaheadRow[]>([])
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current

    if (!active || !builders || fold(query).length < MIN_QUERY_LENGTH) {
      setRows([])
      return
    }

    const timer = setTimeout(() => {
      const spec = builders.typeahead(query)
      fetchDataset<TypeaheadRow>(spec.datasetKey, spec.params, TYPEAHEAD_FETCH_OPTS)
        .then((result) => {
          if (generation !== generationRef.current) return
          setRows(result)
        })
        .catch(() => {
          if (generation !== generationRef.current) return
          setRows([])
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, active, builders])

  return { rows }
}
