// src/hooks/last48Truncation.ts
//
// Pure helpers for The Last 48's per-stream ROW CAP. useLast48Window draws
// each stream's 48-hour window with `$order DESC, $limit LAST48_ROW_CAP`;
// 311 runs past that cap on busy weekdays (2,081–2,843 cases/day measured
// Aug 19–Sept 1 2026, so two weekdays routinely exceed 5,000). When the cap
// trips, the OLDEST rows in the window are the ones that never arrive.
//
// The cap is a DRAW limit, not the window's truth. Every stated count goes
// through these helpers so a figure is either PRESENT (true), SUPPRESSED
// (withheld with the reason stated), or ABSENT ('—') — never the drawn
// sample's length passed off as the window's size.
//
// ZERO imports: this is a leaf the hook, the chips, the rail, the summary
// seed and the heartbeat all read.

/** Mirror of useLast48Window's FULL_LIMIT — the hook imports THIS constant
 *  so the tripwire and the query limit cannot drift apart. */
export const LAST48_ROW_CAP = 5000

/** Per-stream inputs the helpers read (the shape the hook exposes). */
export interface WindowTotalPart {
  /** Rows currently held for the stream (the drawn sample, after the 48h
   *  eviction). Can exceed the cap when earlier polls' rows are still inside
   *  the window. */
  loaded: number
  /** True when the last FULL fetch returned exactly the cap. */
  truncated: boolean
  /** Server `count(*)` for the same cutoff as the capped fetch; null when the
   *  count query failed (or the stream isn't capped). */
  serverTotal: number | null
}

/** The window's true size for one stream. Loaded count when the fetch was not
 *  capped; the server total when it was; null when it was capped and the
 *  count query failed (ABSENT — never guess). A server total can't be smaller
 *  than what we hold from the same window, so a stale-low count is floored at
 *  the loaded figure rather than reported as fewer rows than are on screen. */
export function windowTotal(
  loaded: number,
  truncated: boolean,
  serverTotal: number | null,
): number | null {
  if (!truncated) return loaded
  if (serverTotal === null || !Number.isFinite(serverTotal)) return null
  return Math.max(loaded, serverTotal)
}

/** Sum across streams. `exact` is false when any capped stream lacks a server
 *  total — the caller renders "N+" and says why. Such a stream contributes
 *  its loaded count (a floor: those rows exist), so the sum is a minimum. */
export function windowTotalAcross(
  parts: WindowTotalPart[],
): { total: number; exact: boolean } {
  let total = 0
  let exact = true
  for (const p of parts) {
    const t = windowTotal(p.loaded, p.truncated, p.serverTotal)
    if (t === null) {
      exact = false
      total += p.loaded
    } else {
      total += t
    }
  }
  return { total, exact }
}

/** Reader-facing note for a capped stream. null when not capped (callers
 *  that have already gated on the capped state can omit the third argument).
 *
 *  capped, total known:  "5,000 loaded of 5,516 · oldest hours not loaded"
 *  capped, total null:   "5,000 loaded · window total unavailable" */
export function truncationNote(
  loaded: number,
  serverTotal: number | null,
  truncated = true,
): string | null {
  if (!truncated) return null
  const loadedText = loaded.toLocaleString('en-US')
  if (serverTotal === null || !Number.isFinite(serverTotal)) {
    return `${loadedText} loaded · window total unavailable`
  }
  return `${loadedText} loaded of ${serverTotal.toLocaleString('en-US')} · oldest hours not loaded`
}

/** How many of the sparkline's oldest bins hold no loaded data because the cap
 *  cut them: bins WHOLLY before the oldest loaded event. 0 when not capped, 0
 *  when nothing is loaded (nothing to anchor on), clamped to binCount. */
export function cappedLeadingBins(opts: {
  truncated: boolean
  oldestLoadedMs: number | null
  windowStartMs: number
  binMs: number
  binCount: number
}): number {
  const { truncated, oldestLoadedMs, windowStartMs, binMs, binCount } = opts
  if (!truncated || oldestLoadedMs === null || binMs <= 0 || binCount <= 0) return 0
  const bins = Math.floor((oldestLoadedMs - windowStartMs) / binMs)
  if (!Number.isFinite(bins) || bins <= 0) return 0
  return Math.min(binCount, bins)
}
