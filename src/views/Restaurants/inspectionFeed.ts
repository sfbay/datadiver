// src/views/Restaurants/inspectionFeed.ts
//
// The July 2025 break in the live inspection feed, and the two card windows
// that never cross it. ZERO-IMPORT pure leaf (spec §3.2).
//
// tvy3-wexg thins on July 1 2025: rows fall from ≈1,011 a month to ≈297
// (−71%), `inspection_type` and `census` go 100% null, and publish lag is only
// about a day — structural, not lag (spec §1, A). A window that straddled the
// break would read that cliff as a fall in inspections, so the view offers two
// fixed 12-month windows, one on each side, and never compares them.
//
// Dates here are DataSF date-only strings ('YYYY-MM-DD'), compared as strings
// — never through Date, which reads a date-only string as UTC midnight and
// lands a day early on a Pacific host. The caller supplies `sfToday` from
// sfTime.ts (`sfLocalCutoff(Date.now()).slice(0, 10)`), keeping this leaf pure.

/** First day of the thinner feed. Every window ends before it or starts on/after it. */
export const FEED_BREAK = '2025-07-01'

/** First date tvy3-wexg publishes (spec §3.2). */
export const FEED_START = '2024-01-02'

export type FeedWindowId = 'since' | 'before'

export interface FeedWindow {
  id: FeedWindowId
  /** Inclusive, 'YYYY-MM-DD'. */
  start: string
  /** Inclusive, 'YYYY-MM-DD'. */
  end: string
}

/** The last 12 months of full records: July 2024 – June 2025. Fixed. */
export const BEFORE_WINDOW: FeedWindow = { id: 'before', start: '2024-07-01', end: '2025-06-30' }

/** The default card window (Jesse, 2026-09-24: open on `since`). */
export const DEFAULT_WINDOW: FeedWindowId = 'since'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Day before a 'YYYY-MM-01' date, as 'YYYY-MM-DD' (no Date parsing of the input). */
function lastDayOfPreviousMonth(year: number, month: number): string {
  const y = month === 1 ? year - 1 : year
  const m = month === 1 ? 12 : month - 1
  // Date.UTC(y, m, 0) is the last day of month m (1-based) — pure integer math.
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/**
 * The 12 whole months before the current SF month, floored at FEED_BREAK:
 *   start = max(FEED_BREAK, first day of (this month − 12))
 *   end   = last day of the previous month
 * At sfToday 2026-09-24 → [2025-09-01, 2026-08-31].
 *
 * In July 2025 itself there was no whole month after the break yet; the window
 * then runs FEED_BREAK → sfToday rather than inverting (it still never crosses).
 */
export function sinceWindow(sfToday: string): FeedWindow {
  const year = Number(sfToday.slice(0, 4))
  const month = Number(sfToday.slice(5, 7))
  const back = `${year - 1}-${pad2(month)}-01`
  const start = back > FEED_BREAK ? back : FEED_BREAK
  const end = lastDayOfPreviousMonth(year, month)
  if (end < start) return { id: 'since', start: FEED_BREAK, end: sfToday < FEED_BREAK ? FEED_BREAK : sfToday }
  return { id: 'since', start, end }
}

/** The window for an id; `since` depends on today, `before` never moves. */
export function feedWindow(id: FeedWindowId, sfToday: string): FeedWindow {
  return id === 'before' ? BEFORE_WINDOW : sinceWindow(sfToday)
}

/** `?window=` → an id; anything unknown or absent → the default. */
export function parseFeedWindow(raw: string | null | undefined): FeedWindowId {
  return raw === 'before' || raw === 'since' ? raw : DEFAULT_WINDOW
}

/** True when [start, end] contains dates on both sides of FEED_BREAK. */
export function straddlesBreak(w: Pick<FeedWindow, 'start' | 'end'>): boolean {
  return w.start < FEED_BREAK && w.end >= FEED_BREAK
}

/** The window's query end, clamped to today: min(W.end, sfToday). */
export function clampedEnd(w: Pick<FeedWindow, 'end'>, sfToday: string): string {
  return w.end < sfToday ? w.end : sfToday
}

/** True when a date (any 'YYYY-MM-DD…' string) falls on or after the break. */
export function isAfterBreak(date: string): boolean {
  return date.slice(0, 10) >= FEED_BREAK
}
