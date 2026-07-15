import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { shiftYearsStr, rollupToSectors, computeClosureZ, type PrefixRow } from './sectorClosureBaseline'

const SF_CITY_FILTER = "city = 'San Francisco'"

function closuresByPrefixQuery(start: string, end: string) {
  return {
    $select: 'substring(self_reported_naics_code,1,3) as p3, count(*) as cnt',
    $group: 'p3',
    $where: `${SF_CITY_FILTER} AND dba_end_date >= '${start}T00:00:00' AND dba_end_date <= '${end}T23:59:59'`,
    $limit: 1000 as const,
  }
}

/**
 * Per-sector closure z-scores: the current window vs the same calendar window
 * in each of the prior five years. Six fixed useDataset calls (hooks-rule safe).
 */
export function useSectorClosureZ(dateRange: { start: string; end: string }): Map<string, number> {
  const windows = useMemo(
    () => Array.from({ length: 6 }, (_, k) => ({
      start: shiftYearsStr(dateRange.start, k),
      end: shiftYearsStr(dateRange.end, k),
    })),
    [dateRange.start, dateRange.end],
  )

  const q0 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[0].start, windows[0].end), [windows[0].start, windows[0].end])
  const q1 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[1].start, windows[1].end), [windows[1].start, windows[1].end])
  const q2 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[2].start, windows[2].end), [windows[2].start, windows[2].end])
  const q3 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[3].start, windows[3].end), [windows[3].start, windows[3].end])
  const q4 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[4].start, windows[4].end), [windows[4].start, windows[4].end])
  const q5 = useDataset<PrefixRow>('businessLocations', closuresByPrefixQuery(windows[5].start, windows[5].end), [windows[5].start, windows[5].end])

  return useMemo(() => {
    const current = rollupToSectors(q0.data)
    const samples = [q1, q2, q3, q4, q5].map((q) => rollupToSectors(q.data))
    // Don't compute z until the baseline windows have all answered — a
    // half-loaded (or errored) baseline reads as "everything is anomalous".
    // useDataset retains [] on error and never auto-retries, so an errored
    // window would otherwise roll up as zero closures for every sector,
    // dragging the sample mean down and inflating z into a false alarm.
    if ([q1, q2, q3, q4, q5].some((q) => q.isLoading || q.error)) return new Map()
    return computeClosureZ(current, samples)
  }, [
    q0.data,
    q1.data,
    q2.data,
    q3.data,
    q4.data,
    q5.data,
    q1.isLoading,
    q2.isLoading,
    q3.isLoading,
    q4.isLoading,
    q5.isLoading,
    q1.error,
    q2.error,
    q3.error,
    q4.error,
    q5.error,
  ])
}
