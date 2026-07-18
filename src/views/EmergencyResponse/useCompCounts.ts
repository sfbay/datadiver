/** Server-true call counts for the comparison window, citywide + per
 *  neighborhood in one GROUP BY. The Incidents card recomputes its delta
 *  from these uncapped aggregates so the % and the raw prior figure can
 *  never disagree — and are immune to the 5K sample cap that forces the
 *  time-based deltas to suppress. Fires only while a comparison is active.
 *  Same validity filters as the current-window counts (apples-to-apples).
 */
import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { SAME_DAY, VALID_RESPONSE } from './soql'
import type { DateRange } from '@/utils/comparisonMode'

export interface CompCounts {
  total: number
  byNeighborhood: Map<string, number>
}

export function useCompCounts(
  compRange: DateRange | null,
  serviceClause: string,
  todClause: string
): CompCounts | null {
  const [counts, setCounts] = useState<CompCounts | null>(null)

  useEffect(() => {
    if (!compRange) {
      setCounts(null)
      return
    }
    let cancelled = false
    const where = [
      `received_dttm >= '${compRange.start}T00:00:00'`,
      `received_dttm <= '${compRange.end}T23:59:59'`,
      'on_scene_dttm IS NOT NULL',
      SAME_DAY,
      VALID_RESPONSE,
      ...(serviceClause ? [serviceClause] : []),
      ...(todClause ? [todClause] : []),
    ].join(' AND ')

    fetchDataset<{ neighborhood?: string; call_count: string }>('fireEMSDispatch', {
      $select: 'neighborhoods_analysis_boundaries as neighborhood, COUNT(*) as call_count',
      $where: where,
      $group: 'neighborhoods_analysis_boundaries',
      $limit: 100,
    })
      .then((rows) => {
        if (cancelled) return
        const byNeighborhood = new Map<string, number>()
        let total = 0
        for (const r of rows) {
          const n = parseInt(r.call_count, 10) || 0
          total += n
          if (r.neighborhood) byNeighborhood.set(r.neighborhood, n)
        }
        setCounts({ total, byNeighborhood })
      })
      .catch(() => {
        if (!cancelled) setCounts(null)
      })
    return () => { cancelled = true }
  }, [compRange?.start, compRange?.end, serviceClause, todClause])

  return counts
}
