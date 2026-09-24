// src/views/Restaurants/closureEpisodes.ts
//
// THE closure-episode rule (spec §3.6) — the one rule, pinned. Pure leaf; the
// storefront generator and the live storefront panel both call it, so the
// snapshot and the panel can only disagree when the data moved.
//
// A shut place gets a Closure row at EVERY reinspection until it passes
// (Golden Flower, permit 31974: four Closure rows, one closure), so the unit
// is the EPISODE, never the row:
//
//   1. Dedupe on (key, date, placard). Never on (key, date, inspection type):
//      genuine same-day second visits exist, and after July 2025 the type is
//      null anyway. A padded-address duplicate (Yarsa 2025-06-25) counts once.
//   2. Within one date, Closure sorts before Pass / Conditional Pass.
//   3. An episode = a run of Closure dates ending at the next Pass or
//      Conditional Pass on the same key.
//   4. `days` = next pass − first closure, shown as "at most N days" (no time
//      of day; the next PUBLISHED pass). A closure and a pass on one date is
//      "closed and cleared the same day": `sameDay`, and `days` is null so it
//      is excluded from every day figure by construction.
//   5. No later pass → `clearedOn: null` — "No later inspection published",
//      never "still closed". Episodes starting on/after FEED_BREAK carry the
//      feed note (`afterBreak`).
//   6. Repeat bar = 2+ episodes on the same key (era 3: permit; era 2: facility
//      id), March 2020 on. Episodes less than 30 days apart (previous cleared
//      date → next closure) merge into one FOR THE BAR only; every episode
//      still lists.
//
// Episodes never cross keys: Moki's (99181) and Kiwa (112297) at 615 Cortland
// Ave. are two permits with one closure each, not a repeat at one address.

import { FEED_BREAK } from './inspectionFeed'
import { normalizePlacard } from './placard'

/** One published placard reading. `key` = permit number (2024+) or facility
 *  id (2020–23); `date` = any 'YYYY-MM-DD…' string. */
export interface PlacardReading {
  key: string
  date: string
  status: string | null | undefined
}

export interface ClosureEpisode {
  key: string
  /** First closure date, 'YYYY-MM-DD'. */
  start: string
  /** Date of the next published Pass / Conditional Pass, or null (none published). */
  clearedOn: string | null
  /** clearedOn − start in whole days; null when same-day or unresolved. */
  days: number | null
  /** Distinct dates with a Closure reading in this run (Golden Flower July 2024: 4). */
  closureVisits: number
  /** Every closure date in the run, ascending. */
  closureDates: string[]
  /** Closure and pass on the same date. */
  sameDay: boolean
  /** Started on/after the July 2025 feed break. */
  afterBreak: boolean
}

/** The repeat bar's floor: March 2020, when the placard era begins (spec §3.6 rule 6). */
export const REPEAT_BAR_FROM = '2020-03-01'
/** Episodes closer than this (cleared → next closure) are one for the bar. */
export const REPEAT_MERGE_DAYS = 30

/** Whole days between two 'YYYY-MM-DD' dates — integer math on the digits,
 *  never Date.parse of a date-only string. */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((ms(b) - ms(a)) / 86_400_000)
}

/**
 * Every closure episode in `readings`, grouped by key, oldest first within a
 * key. Readings dated after `sfToday` (when given) are dropped — the junk
 * 2031-05-16 row must never resolve anything. Readings with no placard are
 * ignored (a NULL status is not a pass).
 */
export function closureEpisodes(readings: Iterable<PlacardReading>, opts: { sfToday?: string } = {}): ClosureEpisode[] {
  // Rule 1: dedupe on (key, date, placard) — a Set per key of "date|0" (closure) / "date|1" (pass or conditional).
  const byKey = new Map<string, Set<string>>()
  for (const r of readings) {
    const p = normalizePlacard(r.status)
    if (!p || !r.key || !r.date) continue
    const date = r.date.slice(0, 10)
    if (opts.sfToday && date > opts.sfToday) continue
    let set = byKey.get(r.key)
    if (!set) byKey.set(r.key, (set = new Set()))
    set.add(`${date}|${p === 'closure' ? 0 : 1}`)
  }

  const out: ClosureEpisode[] = []
  for (const [key, set] of byKey) {
    // Rule 2: "date|0" sorts before "date|1" — closure first within a date.
    const seq = [...set].sort()
    let run: string[] | null = null
    for (const item of seq) {
      const date = item.slice(0, 10)
      const isClosure = item.endsWith('|0')
      if (isClosure) {
        if (run) run.push(date)
        else run = [date]
      } else if (run) {
        // Rule 3: the next pass ends the run.
        out.push(makeEpisode(key, run, date))
        run = null
      }
    }
    if (run) out.push(makeEpisode(key, run, null))
  }
  return out.sort((a, b) => (a.key === b.key ? cmp(a.start, b.start) : cmp(a.key, b.key)))
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function makeEpisode(key: string, closureDates: string[], clearedOn: string | null): ClosureEpisode {
  const start = closureDates[0]
  const sameDay = clearedOn !== null && clearedOn === start
  return {
    key,
    start,
    clearedOn,
    days: clearedOn === null || sameDay ? null : daysBetween(start, clearedOn),
    closureVisits: closureDates.length,
    closureDates,
    sameDay,
    afterBreak: start >= FEED_BREAK,
  }
}

/** Rule 6: how many episodes count toward the repeat bar for ONE key's
 *  episodes (March 2020 on; runs <30 days apart merged). */
export function repeatBarCount(episodes: readonly ClosureEpisode[]): number {
  const eligible = episodes.filter((e) => e.start >= REPEAT_BAR_FROM).sort((a, b) => cmp(a.start, b.start))
  let count = 0
  let prev: ClosureEpisode | null = null
  for (const e of eligible) {
    const merges = prev !== null && prev.clearedOn !== null && daysBetween(prev.clearedOn, e.start) < REPEAT_MERGE_DAYS
    if (!merges) count++
    prev = e
  }
  return count
}

/** True when one key's episodes meet the repeat bar (2+). */
export function meetsRepeatBar(episodes: readonly ClosureEpisode[]): boolean {
  return repeatBarCount(episodes) >= 2
}

/** Group episodes by key. */
export function episodesByKey(episodes: readonly ClosureEpisode[]): Map<string, ClosureEpisode[]> {
  const m = new Map<string, ClosureEpisode[]>()
  for (const e of episodes) {
    const list = m.get(e.key)
    if (list) list.push(e)
    else m.set(e.key, [e])
  }
  return m
}

export interface EpisodeSummary {
  episodes: number
  keys: number
  /** Ended in a published pass, same-day included. */
  cleared: number
  sameDay: number
  unresolved: number
  unresolvedAfterBreak: number
  /** Day figures over cleared, NOT-same-day episodes only (rule 4). null when none. */
  medianDays: number | null
  p75Days: number | null
  p90Days: number | null
  maxDays: number | null
  /** Keys with 2+ episodes (raw, unmerged) — the generator's G5 figure. */
  keysWith2Plus: number
  keysWith3Plus: number
  /** Keys meeting the repeat bar (merged, March 2020 on). */
  repeatKeys: number
}

/** Lower nearest-rank percentile over a sorted array: sorted[floor(p·(n−1))]. */
function pct(sorted: readonly number[], p: number): number | null {
  return sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : null
}

function median(sorted: readonly number[]): number | null {
  const n = sorted.length
  if (!n) return null
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

/** Headline figures for a set of episodes (the generator pins these at asOf). */
export function summarizeEpisodes(episodes: readonly ClosureEpisode[]): EpisodeSummary {
  const days = episodes.flatMap((e) => (e.days === null ? [] : [e.days])).sort((a, b) => a - b)
  const grouped = episodesByKey(episodes)
  let keysWith2Plus = 0
  let keysWith3Plus = 0
  let repeatKeys = 0
  for (const list of grouped.values()) {
    if (list.length >= 2) keysWith2Plus++
    if (list.length >= 3) keysWith3Plus++
    if (meetsRepeatBar(list)) repeatKeys++
  }
  const unresolved = episodes.filter((e) => e.clearedOn === null)
  return {
    episodes: episodes.length,
    keys: grouped.size,
    cleared: episodes.length - unresolved.length,
    sameDay: episodes.filter((e) => e.sameDay).length,
    unresolved: unresolved.length,
    unresolvedAfterBreak: unresolved.filter((e) => e.afterBreak).length,
    medianDays: median(days),
    p75Days: pct(days, 0.75),
    p90Days: pct(days, 0.9),
    maxDays: days.length ? days[days.length - 1] : null,
    keysWith2Plus,
    keysWith3Plus,
    repeatKeys,
  }
}
