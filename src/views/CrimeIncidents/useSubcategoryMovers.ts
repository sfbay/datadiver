// src/views/CrimeIncidents/useSubcategoryMovers.ts
//
// Two grouped queries — the active window and its comparison — feeding BOTH
// the sidebar turn-down and the two strips, so a subcategory's count can
// never disagree between them. SF only; the historical extract publishes no
// subcategory at all, so a range that touches it disables the hook entirely.
//
// The queries carry the view's neighborhood + time-of-day context but NOT its
// category/subcategory selection: a strip that re-ranked what you had already
// filtered to would only ever tell you about your own click.
import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { buildSfCrimeDateOnly } from './crimeDialect'
import { SF_CRIME_COUNT } from './crimeCount'
import {
  pairKey, splitPairKey, subcategoryLabel, isEcho, watchEntry, SUBCATEGORY_WATCH,
} from './subcategoryWatch'
import { rankMovers, type Mover, type MoverInput } from './subcategoryMovers'
import { resolveMoverWindows } from './subcategoryWindows'
import type { ComparisonMode, DateRange } from '@/utils/comparisonMode'

interface SubcatAggRow {
  incident_category: string
  incident_subcategory: string
  n: string
}

export interface SubcategoryRow {
  key: string
  subcategory: string
  label: string
  count: number
  /** Every pair key this row's checkbox must filter on (self + authored
   *  merges). The sidebar hands this straight to the view's toggleSub. */
  keys: string[]
}

export interface SubcategoryData {
  /** Current-window rows per category, biggest first — the sidebar drill. */
  byCategory: Map<string, SubcategoryRow[]>
  crimeMovers: Mover[]
  enforcementMovers: Mover[]
  /** "vs July 4, 2025". Empty when no comparison was possible. */
  comparisonLabel: string
  /** False when the comparison window could not be resolved or returned
   *  nothing — the strip says so rather than showing thin numbers. */
  compared: boolean
  isLoading: boolean
}

const EMPTY: SubcategoryData = {
  byCategory: new Map(), crimeMovers: [], enforcementMovers: [],
  comparisonLabel: '', compared: false, isLoading: false,
}

export function useSubcategoryMovers(opts: {
  /** isSF && !hasHistorical. */
  enabled: boolean
  dateRange: DateRange
  comparisonMode: ComparisonMode
  /** MAX(incident_datetime) from useDataFreshness — the clamp source. */
  latestDate: string | null
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}): SubcategoryData {
  const { enabled, dateRange, comparisonMode, latestDate } = opts

  const windows = useMemo(
    () => (enabled ? resolveMoverWindows(dateRange, comparisonMode, latestDate) : null),
    [enabled, dateRange, comparisonMode, latestDate],
  )

  const currentWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.current, timeOfDayFilter: opts.timeOfDayFilter,
  }) + (opts.selectedNeighborhood
    ? ` AND analysis_neighborhood = '${opts.selectedNeighborhood.replace(/'/g, "''")}'`
    : '') : ''), [windows, opts.selectedNeighborhood, opts.timeOfDayFilter])

  const priorWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.comparison, timeOfDayFilter: opts.timeOfDayFilter,
  }) + (opts.selectedNeighborhood
    ? ` AND analysis_neighborhood = '${opts.selectedNeighborhood.replace(/'/g, "''")}'`
    : '') : ''), [windows, opts.selectedNeighborhood, opts.timeOfDayFilter])

  const QUERY = {
    $select: `incident_category, incident_subcategory, ${SF_CRIME_COUNT} as n`,
    $group: 'incident_category, incident_subcategory',
    $order: 'n DESC',
    $limit: 200,
  }

  const cur = useDataset<SubcatAggRow>(
    'policeIncidents', { ...QUERY, $where: currentWhere }, [currentWhere],
    { enabled: enabled && !!windows },
  )
  const pri = useDataset<SubcatAggRow>(
    'policeIncidents', { ...QUERY, $where: priorWhere }, [priorWhere],
    { enabled: enabled && !!windows },
  )

  return useMemo(() => {
    if (!enabled || !windows) return EMPTY

    // Authored merges: SFPD publishes two live strings for vehicle break-ins.
    // Fold the merged-away row into its canonical row, or the sidebar shows
    // two rows where the strip shows one chip — three numbers for two things.
    const mergedAway = new Map<string, string>()
    for (const [target, e] of Object.entries(SUBCATEGORY_WATCH)) {
      for (const m of e.merge ?? []) mergedAway.set(m, target)
    }

    const counts = new Map<string, number>()
    for (const r of cur.data) {
      const category = r.incident_category ?? ''
      const subcategory = r.incident_subcategory ?? ''
      if (!category || !subcategory) continue
      counts.set(pairKey(category, subcategory), parseInt(r.n, 10) || 0)
    }

    const byCategory = new Map<string, SubcategoryRow[]>()
    for (const [key] of counts) {
      if (mergedAway.has(key)) continue            // folded into its canonical row
      const { category, subcategory } = splitPairKey(key)
      // An echo row repeats its category and adds nothing to drill into.
      if (isEcho(category, subcategory)) continue
      const keys = [key, ...(watchEntry(key)?.merge ?? [])]
      const count = keys.reduce((sum, k) => sum + (counts.get(k) ?? 0), 0)
      const list = byCategory.get(category) ?? []
      list.push({ key, subcategory, label: subcategoryLabel(category, subcategory), count, keys })
      byCategory.set(category, list)
    }
    for (const list of byCategory.values()) list.sort((a, b) => b.count - a.count)

    const priorByKey = new Map<string, number>()
    for (const r of pri.data) {
      priorByKey.set(
        pairKey(r.incident_category ?? '', r.incident_subcategory ?? ''),
        parseInt(r.n, 10) || 0,
      )
    }

    // A comparison side that never arrived is ABSENCE, not zero: rank nothing
    // rather than reporting every bucket as newly invented.
    const compared = !pri.isLoading && pri.data.length > 0
    const inputs: MoverInput[] = compared ? cur.data.flatMap((r) => {
      const category = r.incident_category ?? ''
      const subcategory = r.incident_subcategory ?? ''
      if (!category || !subcategory) return []
      const key = pairKey(category, subcategory)
      return [{
        key, category, subcategory,
        current: parseInt(r.n, 10) || 0,
        prior: priorByKey.get(key) ?? 0,
      }]
    }) : []

    return {
      byCategory,
      crimeMovers: rankMovers(inputs, 'crime'),
      enforcementMovers: rankMovers(inputs, 'enforcement'),
      comparisonLabel: windows.label,
      compared,
      isLoading: cur.isLoading || pri.isLoading,
    }
  }, [enabled, windows, cur.data, cur.isLoading, pri.data, pri.isLoading])
}
