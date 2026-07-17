/** Trailing-90-day mean daily call count for the Incidents card subtitle.
 *  Window ends at the SELECTED range's end (seasonal adjacency), matching the
 *  stat cards' validity filter so the counts are apples-to-apples. The fetch
 *  itself is gated on `enabled` (range ≤ 7 days) — don't pay for a query the
 *  view won't render. Any failure → line: null (garnish, never the meal).
 *  `extraClause` threads BOTH the service filter and the time-of-day filter
 *  from the caller so the typical figure matches what the Incidents card
 *  actually counts — a time-of-day-sliced count compared against an
 *  all-hours typical figure would be apples-to-oranges.
 */
import { useEffect, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { addDays } from '@/utils/comparisonMode'
import { SAME_DAY, VALID_RESPONSE } from './soql'
import { meanDailyCount, typicalDayLine, type DailyCountRow } from './typicalDay'

export function useTypicalDay(
  enabled: boolean,
  extraClause: string,
  rangeEnd: string
): { line: string | null } {
  const [line, setLine] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLine(null)
      return
    }
    let cancelled = false
    const where = [
      `received_dttm >= '${addDays(rangeEnd, -90)}T00:00:00'`,
      `received_dttm <= '${rangeEnd}T23:59:59'`,
      'on_scene_dttm IS NOT NULL',
      SAME_DAY,
      VALID_RESPONSE,
      ...(extraClause ? [extraClause] : []),
    ].join(' AND ')

    fetchDataset<DailyCountRow>('fireEMSDispatch', {
      $select: 'date_trunc_ymd(received_dttm) as day, count(*) as count',
      $where: where,
      $group: 'day',
      $limit: 200,
    })
      .then((rows) => {
        if (cancelled) return
        const mean = meanDailyCount(rows)
        setLine(mean === null ? null : typicalDayLine(mean))
      })
      .catch(() => {
        if (!cancelled) setLine(null)
      })
    return () => { cancelled = true }
  }, [enabled, extraClause, rangeEnd])

  return { line }
}
