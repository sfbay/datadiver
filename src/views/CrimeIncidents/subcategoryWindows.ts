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
