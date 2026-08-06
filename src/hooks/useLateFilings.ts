import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type { CityId } from '@/cities/routing'
import { fppcBuildersFor } from '@/views/CampaignFinance/fppcDialect'

interface LateIERow {
  cand_naml?: string
  bal_name?: string
  sup_opp_cd?: string
  total: string
}

export interface LateIETarget {
  target: string
  kind: 'candidate' | 'measure' | 'unattributed'
  support: number
  oppose: number
}

export interface LateFilingsResult {
  /** null when this city has no view-level late section (SF). */
  targets: LateIETarget[] | null
  lateContribTotal: number
  lateContribCount: number
  nullDateCount: number
  nullDateTotal: number
  isLoading: boolean
}

/** Pure — node-testable if ever needed. Folds the 496 GROUP BY rows into
 *  per-target support/oppose splits, sorted by combined money. */
export function foldLateIE(rows: LateIERow[]): LateIETarget[] {
  const byTarget = new Map<string, LateIETarget>()
  for (const r of rows) {
    const name = (r.cand_naml || '').trim() || (r.bal_name || '').trim()
    const kind: LateIETarget['kind'] = (r.cand_naml || '').trim()
      ? 'candidate'
      : (r.bal_name || '').trim() ? 'measure' : 'unattributed'
    // Oakland's 496 dataset publishes the same candidate under multiple
    // casings (count(distinct cand_naml)=142 vs count(distinct upper(...))=126,
    // live-probed) — key the fold on the case-folded name so "Carroll Fife"
    // and "CARROLL FIFE" merge into one target, but keep the first-seen
    // spelling for display. Rows arrive $order: 'total DESC', so the
    // biggest filer's spelling wins.
    const key = (name || 'Unattributed').trim().toUpperCase()
    const entry = byTarget.get(key) ?? { target: name || 'Unattributed', kind, support: 0, oppose: 0 }
    const amt = parseFloat(r.total) || 0
    if (r.sup_opp_cd === 'O') entry.oppose += amt
    else entry.support += amt // 'S' and blank both count as support-side money
    byTarget.set(key, entry)
  }
  return Array.from(byTarget.values()).sort(
    (a, b) => (b.support + b.oppose) - (a.support + a.oppose)
  )
}

export function useLateFilings(
  dateRange: { start: string; end: string },
  cityId: CityId
): LateFilingsResult {
  const [result, setResult] = useState<Omit<LateFilingsResult, 'isLoading'>>({
    targets: null, lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef(0)

  useEffect(() => {
    const b = fppcBuildersFor(cityId)
    const ieSpec = b.lateIEByTarget(dateRange.start, dateRange.end)
    if (!ieSpec) {
      setResult({ targets: null, lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0 })
      return
    }
    const id = ++abortRef.current
    setIsLoading(true)
    const contribSpec = b.lateContribsSummary(dateRange.start, dateRange.end)
    const nullSpec = b.nullDateDisclosure()
    Promise.all([
      fetchDataset<LateIERow>(ieSpec.datasetKey, ieSpec.params, { cityId }),
      contribSpec
        ? fetchDataset<{ total: string; cnt: string }>(contribSpec.datasetKey, contribSpec.params, { cityId })
        : Promise.resolve([]),
      nullSpec
        ? fetchDataset<{ cnt: string; total: string }>(nullSpec.datasetKey, nullSpec.params, { cityId })
        : Promise.resolve([]),
    ])
      .then(([ieRows, contribRows, nullRows]) => {
        if (id !== abortRef.current) return
        setResult({
          targets: foldLateIE(ieRows),
          lateContribTotal: parseFloat(contribRows[0]?.total || '0') || 0,
          lateContribCount: parseInt(contribRows[0]?.cnt || '0', 10) || 0,
          nullDateCount: parseInt(nullRows[0]?.cnt || '0', 10) || 0,
          nullDateTotal: parseFloat(nullRows[0]?.total || '0') || 0,
        })
      })
      .catch(() => {
        if (id === abortRef.current) {
          setResult({ targets: [], lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0 })
        }
      })
      .finally(() => {
        if (id === abortRef.current) setIsLoading(false)
      })
  }, [dateRange.start, dateRange.end, cityId])

  return { ...result, isLoading }
}
