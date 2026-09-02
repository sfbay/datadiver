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
  /** True when the rows held for the stream fall short of its window — see
   *  coverageTruncated(). Not "the last draw hit the cap": held rows
   *  accumulate across polls, so that alone stops being the missing-rows fact
   *  a few hours into a session. */
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
 *  that have already gated on the capped state can omit the third argument),
 *  and null when the total is known and we hold at least that many rows —
 *  nothing is missing, so there is nothing to disclose. Pass the total that
 *  windowTotal() produced (floored at the loaded count), never the raw
 *  server figure: "5,300 loaded of 5,100 · oldest hours not loaded" is a
 *  sentence that contradicts itself.
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
  if (serverTotal <= loaded) return null
  return `${loadedText} loaded of ${serverTotal.toLocaleString('en-US')} · oldest hours not loaded`
}

/** Slack for the coverage test: how far past the window start the oldest held
 *  row may sit before the window counts as under-covered. Absorbs the seconds
 *  between the rows query and the eviction clock plus a naturally quiet
 *  stretch at the window's far edge; anything larger means the DESC draw's
 *  cut is still inside the window. Fifteen minutes — deliberately smaller
 *  than a sparkline bin (2h): a sub-bin gap can't be hatched, but the FIGURES
 *  beside the sparkline stay true (the rate and the note still use the
 *  server total), and a wrong figure is the worse error. */
export const COVERAGE_SLACK_MS = 15 * 60 * 1000

/** Whether the rows HELD for a stream fall short of its 48-hour window — the
 *  fact the reader-facing "oldest hours not loaded" copy, the sparkline
 *  hatch and the loaded-vs-total figures all describe.
 *
 *  Held rows accumulate across polls (each draw is merged into the prior
 *  ones; only rows older than 48h are evicted), so a tab left open grows its
 *  coverage back toward the window start even though every poll keeps
 *  returning exactly the cap. "The last draw hit the cap" is therefore NOT
 *  the same fact as "the oldest hours are missing". This decides the latter:
 *    - never truncated unless the draw hit the cap — an uncapped draw IS the
 *      whole window by construction;
 *    - not truncated once the oldest held row reaches the window start
 *      (within slackMs) — earlier polls have filled the cut in;
 *    - not truncated when the server total is known and we hold at least
 *      that many rows — a quiet stretch at the window's edge can't be told
 *      from a cut by coverage alone; the count settles it (it can only ever
 *      clear the flag, never set it, so the timing skew between the rows
 *      query and the count — the count sees rows that arrived in between —
 *      cannot fabricate a truncation).
 *  Nothing held after a capped draw is treated as truncated: coverage can't
 *  be proven, and the loaded figure is still stated as loaded. */
export function coverageTruncated(opts: {
  /** The full draw returned at least the cap. */
  drewCap: boolean
  /** Rows held for the stream after the 48h eviction. */
  heldCount: number
  /** receivedAt of the oldest held row; null when nothing is held. */
  oldestHeldMs: number | null
  /** The held set's own floor (the eviction cutoff). */
  windowStartMs: number
  /** Server count(*) for the window when known, else null. */
  serverTotal: number | null
  slackMs?: number
}): boolean {
  const { drewCap, heldCount, oldestHeldMs, windowStartMs, serverTotal } = opts
  const slackMs = opts.slackMs ?? COVERAGE_SLACK_MS
  if (!drewCap) return false
  if (oldestHeldMs !== null && oldestHeldMs - windowStartMs <= slackMs) return false
  if (serverTotal !== null && Number.isFinite(serverTotal) && heldCount >= serverTotal) return false
  return true
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
