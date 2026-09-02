// src/views/CrimeIncidents/subcategoryWindows.ts
//
// Where the strip's two windows come from. Pure, so the clamp can be tested
// without a network or a DOM.
//
// THE CLAMP IS LOAD-BEARING. SFPD publishes a few days behind. If the current
// window runs to the range end while the prior window is full, every bucket
// shows a decline that is an artifact of the calendar. Clamp the current end
// to MAX(incident_datetime) and shift the comparison by the CLAMPED length —
// the same rule Traffic Safety uses for YoY (CLAUDE.md -> Trend
// Infrastructure).
import {
  addDays, rangeLengthDays, resolveComparisonRange, comparisonLabel,
  type ComparisonMode, type DateRange,
} from '@/utils/comparisonMode'
import { SUBCATEGORY_WATCH, splitPairKey, isEcho, watchEntry } from './subcategoryWatch'

export interface MoverWindows {
  current: DateRange
  comparison: DateRange
  /** "vs July 4, 2025" or "vs the previous 365 days". */
  label: string
}

export function resolveMoverWindows(
  range: DateRange,
  mode: ComparisonMode,
  latestDate: string | null,
): MoverWindows | null {
  const end = latestDate && latestDate < range.end ? latestDate : range.end
  if (end < range.start) return null
  const current: DateRange = { start: range.start, end }

  const resolved = resolveComparisonRange(mode, current)
  if (resolved) {
    return { current, comparison: resolved, label: comparisonLabel(mode, current) }
  }
  // Compare is off. Fall back to the window immediately before this one.
  const len = rangeLengthDays(current)
  const comparison: DateRange = {
    start: addDays(current.start, -(len + 1)),
    end: addDays(current.start, -1),
  }
  return { current, comparison, label: `vs the previous ${len + 1} days` }
}

export interface SidebarCountRow {
  key: string
  /** Every pair key this row's checkbox must filter on (self + authored
   *  merges present in this window). */
  keys: string[]
  count: number
}

// Authored merges: SFPD publishes two live strings for vehicle break-ins.
// Fold the merged-away row into its canonical row, or the sidebar shows two
// rows where the strip shows one chip — three numbers for two things.
//
// The fold is CONDITIONAL on the canonical target actually having rows in
// THIS window (mirrors foldMerges in subcategoryMovers.ts). A narrow slice —
// one neighborhood, a short date range — can return rows for the merged-away
// string with zero for its canonical target; unconditionally dropping the
// merged-away key in that case deletes real incidents from the sidebar under
// either name. When the target is absent, the merged-away key stands on its
// own: its own label, `keys: [key]` (no partner to filter alongside here).
export function foldSidebarCounts(counts: Map<string, number>): SidebarCountRow[] {
  const mergedAway = new Map<string, string>()
  for (const [target, e] of Object.entries(SUBCATEGORY_WATCH)) {
    for (const m of e.merge ?? []) mergedAway.set(m, target)
  }

  const rows: SidebarCountRow[] = []
  for (const [key] of counts) {
    const target = mergedAway.get(key)
    if (target && counts.has(target)) continue   // folded into its canonical row below
    const { category, subcategory } = splitPairKey(key)
    // An echo row repeats its category and adds nothing to drill into.
    if (isEcho(category, subcategory)) continue
    const keys = target ? [key] : [key, ...(watchEntry(key)?.merge ?? [])]
    const count = keys.reduce((sum, k) => sum + (counts.get(k) ?? 0), 0)
    rows.push({ key, keys, count })
  }
  return rows
}
