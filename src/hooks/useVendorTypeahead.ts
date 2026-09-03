// Live ⌘K / Home-search VENDOR rows — the sibling of useFunderTypeahead.
// Debounced 250 ms, fires only while the search surface is active, the
// city is SF (the only city with a vendor-payments registry entry), and the
// query is at least 3 characters. Same generation guard + `pending` contract
// as the funder hook, so the surfaces can treat the two identically.
//
// QUERY SHAPE IS LOAD-BEARING. Measured 2026-09-02 on n9pm-xkyq: a
// `LIKE '%q%'` (contains) GROUP BY vendor took ~4.1 s; a PREFIX `LIKE 'q%'`
// took ~0.5–0.8 s. Socrata's `$q` text index is fast too but matches EVERY
// column (typing 'salesforce' returned the consultancies whose payment
// descriptions mention Salesforce), so it lies about who the vendor is.
// Prefix it is: a reader types the start of a name. Vendor names are
// mixed-case in the data ('WCG Inc (West Coast…)'), hence UPPER() both sides.

import { useEffect, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'

export interface VendorTypeaheadRow {
  vendor: string
  /** Socrata aggregate serialization — strings. */
  total: string
  payments: string
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 3
const FETCH_OPTS = { cityId: 'sf' as const, timeoutMs: 6_000, retries: 0 }

/** Fold a typed query into a SoQL prefix: trim, upper-case, escape the
 *  string quote, and drop LIKE wildcards so a reader cannot widen the scan. */
export function vendorPrefix(query: string): string {
  return query.trim().toUpperCase().replace(/'/g, "''").replace(/[%_]/g, '')
}

export function useVendorTypeahead(
  query: string,
  active: boolean,
  enabled: boolean
): { rows: VendorTypeaheadRow[]; pending: boolean } {
  const [rows, setRows] = useState<VendorTypeaheadRow[]>([])
  const [pending, setPending] = useState(false)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    const prefix = vendorPrefix(query)

    if (!active || !enabled || prefix.length < MIN_QUERY_LENGTH) {
      setRows([])
      setPending(false)
      return
    }

    setPending(true)
    const timer = setTimeout(() => {
      fetchDataset<VendorTypeaheadRow>(
        'vendorPayments',
        {
          $select: 'vendor, SUM(vouchers_paid) as total, COUNT(*) as payments',
          $where: `UPPER(vendor) LIKE '${prefix}%'`,
          $group: 'vendor',
          $order: 'total DESC',
          $limit: 8,
        },
        FETCH_OPTS
      )
        .then((result) => {
          if (generation !== generationRef.current) return
          setRows(result)
          setPending(false)
        })
        .catch(() => {
          if (generation !== generationRef.current) return
          setRows([])
          setPending(false)
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, active, enabled])

  return { rows, pending }
}
