// src/views/CrimeIncidents/useSubcategoryMovers.ts
//
// Two grouped queries — the active window and its comparison — feeding BOTH
// the sidebar turn-down and the two strips, so a subcategory's count can
// never disagree between them. SF only; the historical extract publishes no
// subcategory at all, so a range that touches it disables the hook entirely.
//
// CITYWIDE ALWAYS — deliberately NOT filtered to a selected neighborhood.
// The parent category counts these child rows sit under (CrimeIncidents.tsx's
// `categoryRows`, from useCrimeEraData's `categoryRows`) are themselves
// citywide (CLAUDE.md's comparison-not-drilldown rule: the sidebar ranking
// stays a citywide comparison frame even when a neighborhood is selected).
// If this hook filtered by neighborhood, the sidebar drill's children would
// answer a different, much smaller question than the parent total printed
// above them, with no way for a reader to tell from two adjacent bare
// numbers. Time-of-day stays in these queries (the parent category rows
// carry it too); category/subcategory selection stays out — a strip that
// re-ranked what you had already filtered to would only ever tell you about
// your own click.
import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { buildSfCrimeDateOnly } from './crimeDialect'
import { SF_CRIME_COUNT } from './crimeCount'
import { pairKey, splitPairKey, subcategoryLabel } from './subcategoryWatch'
import { rankMovers, type Mover, type MoverInput } from './subcategoryMovers'
import { resolveMoverWindows, foldSidebarCounts } from './subcategoryWindows'
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
  /** useDataFreshness's own isLoading. `latestDate === null` is AMBIGUOUS on
   *  its own: it means "the probe hasn't returned yet" while loading, but
   *  useDataFreshness also SWALLOWS its fetch error, so a failed probe reads
   *  as the identical null forever after loading clears. Treating either
   *  case as "safe to skip the clamp" would rank lag-biased declines —
   *  silently, and possibly permanently. Both must read as NOT READY. */
  freshnessLoading: boolean
  timeOfDayFilter: { startHour: number; endHour: number } | null
}): SubcategoryData {
  const { enabled, dateRange, comparisonMode, latestDate, freshnessLoading } = opts
  // Not ready until the freshness probe has both finished AND produced a
  // real date. resolveMoverWindows itself still accepts a null latestDate
  // (it's a pure fallback for callers with no freshness concept at all) —
  // this hook must never be the caller that leans on that fallback while
  // still waiting on its OWN probe.
  const ready = !freshnessLoading && latestDate !== null

  const windows = useMemo(
    () => (enabled && ready ? resolveMoverWindows(dateRange, comparisonMode, latestDate) : null),
    [enabled, ready, dateRange, comparisonMode, latestDate],
  )

  const currentWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.current, timeOfDayFilter: opts.timeOfDayFilter,
  }) : ''), [windows, opts.timeOfDayFilter])

  const priorWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.comparison, timeOfDayFilter: opts.timeOfDayFilter,
  }) : ''), [windows, opts.timeOfDayFilter])

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
    if (!enabled) return EMPTY
    // Not ready reads as LOADING, never as absence — the strip already has a
    // loading state (skeleton, no sentence) for exactly this.
    if (!ready) return { ...EMPTY, isLoading: true }
    if (!windows) return EMPTY

    const counts = new Map<string, number>()
    for (const r of cur.data) {
      const category = r.incident_category ?? ''
      const subcategory = r.incident_subcategory ?? ''
      if (!category || !subcategory) continue
      counts.set(pairKey(category, subcategory), parseInt(r.n, 10) || 0)
    }

    const byCategory = new Map<string, SubcategoryRow[]>()
    for (const { key, keys, count } of foldSidebarCounts(counts)) {
      const { category, subcategory } = splitPairKey(key)
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
  }, [enabled, ready, windows, cur.data, cur.isLoading, pri.data, pri.isLoading])
}
