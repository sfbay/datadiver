import { parseSfLocal } from '@/utils/sfTime'
import { CITIES } from '@/cities/registry'
import { completeWindow } from '@/utils/completeWindow'
import { apDate } from '@/utils/apDate'

export { completeWindow } from '@/utils/completeWindow'
export { apDate } from '@/utils/apDate'

/**
 * Pure framing logic for the Oakland landing ticker (spec §B2).
 *
 * GOVERNING RULE: every count window ends at the stream's COMPLETENESS EDGE,
 * never at max(dateField). Oakland's feeds have fill-in tails — a naive
 * "past 7 days" crime count returned 76 against a ~385 steady state while
 * max(datetime) was only 2 days old (the banked ticker-freshness class).
 * Edges below were measured 2026-08-07 from live fill-in curves (full
 * method + tables: the 4b plan, Task 1):
 *  - crime (ppgh-7dqv): offsets 0–7 before max run ~2%→56% of the steady
 *    daily median (~55–63/day depending on window); offset 8 is the first
 *    day clearing 85% of it → edge 8.
 *  - 311 (quth-gb8e): day max−1 sits at the TOP of the weekday band —
 *    next-day-complete → edge 1.
 *  - citations (58em-y96b): offset 0 (a Monday at ~10% of the Monday norm)
 *    is incomplete; offsets 1–2 were VERIFIED complete weekend days against
 *    their own day-matched floors → edge 1. Note the edge is day-of-week
 *    dependent and layered ON TOP of the ~11-week base publishing lag —
 *    the dated copy carries the truth either way.
 * Campaign finance uses no edge: the item shows a CONCLUDED cycle's total
 * (complete by construction) and names the cycle — "filed through
 * max(tran_date)" was rejected as fabricated completeness (the current
 * semiannual is unfiled; that max rests on outlier rows).
 * Edges are authored on the registry entries (`completeness.edgeDays`);
 * this constant derives them.
 */
const oakEdge = (key: string) => CITIES.oakland.datasets[key].completeness!.edgeDays

export const OAK_TICKER_EDGES = {
  crimeEdgeDays: oakEdge('policeIncidents'),
  crimeSuppressMaxAgeDays: 14,
  threeOneOneEdgeDays: oakEdge('cases311'),
  threeOneOneSuppressMaxAgeDays: 3,
  citationsEdgeDays: oakEdge('parkingCitations'),
} as const

// completeWindow moved to src/utils/completeWindow.ts (re-exported above) —
// a library module (sourceLine.ts) needed it without depending on a view.

/** True when the stream's max(dateField) is older than maxAgeDays. */
export function isStaleLocal(maxLocal: string, maxAgeDays: number, nowMs: number): boolean {
  return nowMs - parseSfLocal(maxLocal) > maxAgeDays * 86_400_000
}

// apDate moved to src/utils/apDate.ts (re-exported above) — the repo's ONE
// AP-date authority, needed outside Home too (a second private table is the
// duplicated-allowlist class).

const n = (v: number) => v.toLocaleString('en-US')

/** Compact money: $4.0M / $950K / $412 — headline register. */
function money(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v)}`
}

// Headlines SELF-DATE (the hero/standard tickers never render `detail`);
// values are bare big-figures (TickerCard renders value under the headline).
export function crimeCopy(count: number, weekEnd: string, nowYear: number) {
  return { headline: `${n(count)} crime incidents · week ending ${apDate(weekEnd, nowYear)}`, value: n(count) }
}
export function threeOneOneCopy(count: number, weekEnd: string, nowYear: number) {
  return { headline: `${n(count)} 311 requests · week ending ${apDate(weekEnd, nowYear)}`, value: n(count) }
}
export function citationsCopy(count: number, throughDate: string, nowYear: number) {
  return { headline: `${n(count)} parking citations · 30 days through ${apDate(throughDate, nowYear)}`, value: n(count) }
}
export function cfCopy(total: number, cycleLabel: string) {
  return { headline: `${money(total)} raised · ${cycleLabel} cycle`, value: money(total) }
}
