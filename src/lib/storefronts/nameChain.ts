// LEAF (imports only ./storefrontKey, ./venues, ./types) — the turnover rule
// (spec §3.7): who has run a storefront, in what order, and whether the
// parade of names is turnover at all.
//
// The measured shape of the rule (E §2, §5): 130 cleaned storefronts show 3+
// successive names on ANY sighting; 62 + 4 = 66 meet the strict bar where
// every operator was seen on 2+ dates. Owner resolution then sorts those into
// buckets, because a new name is not a new owner — 9 of the top 25 are
// same-owner rebrands (E §3), and 2077 Hayes St is an owner who LEFT AND CAME
// BACK, which every earlier design mislabelled "same owner".
//
// Order of operations the generator follows, one door at a time:
//   sightings → groupOperators → isMultiTenant / turnoverExclusion
//             → longestChain (all, and strict-only) → meetsTurnoverBar
//             → turnoverBucket over the strict chain's owners of record
//
// Dates are 'YYYY-MM-DD'. Day arithmetic goes through Date.UTC on the parsed
// parts — a calendar-day difference, independent of the host's time zone.

import { isStorefrontAddress } from './storefrontKey'
import { isVenue } from './venues'
import type { InspectionEra, TurnoverBucket } from './types'

/** Whole days from `a` to `b` ('YYYY-MM-DD'); negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((day(b) - day(a)) / 86_400_000)
}

// ── string similarity ──────────────────────────────────────────────────

/**
 * Python difflib's `SequenceMatcher(None, a, b).ratio()` — 2·M / (|a| + |b|)
 * where M is the size of the recursive longest-common-block matching. Ported
 * so the 85% similarity threshold means what it meant in the probe. No junk
 * heuristic: difflib's autojunk only engages at 200+ characters, and names
 * are shorter.
 */
export function sequenceRatio(a: string, b: string): number {
  const total = a.length + b.length
  if (total === 0) return 1
  const b2j = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const list = b2j.get(b[j])
    if (list) list.push(j)
    else b2j.set(b[j], [j])
  }
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo
    let bestj = blo
    let bestsize = 0
    let j2len = new Map<number, number>()
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>()
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue
        if (j >= bhi) break
        const k = (j2len.get(j - 1) ?? 0) + 1
        next.set(j, k)
        if (k > bestsize) {
          besti = i - k + 1
          bestj = j - k + 1
          bestsize = k
        }
      }
      j2len = next
    }
    return [besti, bestj, bestsize]
  }
  let matched = 0
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!
    const [i, j, k] = longest(alo, ahi, blo, bhi)
    if (!k) continue
    matched += k
    if (alo < i && blo < j) queue.push([alo, i, blo, j])
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
  }
  return (2 * matched) / total
}

// ── operator names ─────────────────────────────────────────────────────

/** Words that carry no identity for GROUPING (display keeps the raw name). */
const NAME_STOP = new Set([
  'INC', 'LLC', 'CORP', 'CORPORATION', 'CO', 'THE', 'LTD', 'DBA', 'RESTAURANT', 'CAFE', '&', 'AND', 'OF',
  'SF', 'SAN', 'FRANCISCO', 'BAR', 'KITCHEN', 'LP', 'L', 'P',
])
/** Records that name nobody: DPH's placeholders for a permit in transition. */
const PLACEHOLDER = /^(TBD|NEW OWNER|UNKNOWN|NA|N A|NONE)$/

/**
 * The grouping form of an operator name: upper-case, apostrophes dropped,
 * `PLAN CHECK -` and `DBA:` prefixes dropped, punctuation blanked, and
 * INC/LLC/THE/CAFE/RESTAURANT-class words removed. '' for a placeholder
 * ('TBD', 'NEW OWNER') — such a sighting names no operator.
 */
export function cleanOperatorName(raw: string | null | undefined): string {
  let s = (raw ?? '').toUpperCase().replace(/[’'`]/g, '')
  s = s.replace(/^\s*(PLAN CHECK|DBA)\b\s*[-:]?\s*/, '')
  s = s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (PLACEHOLDER.test(s)) return ''
  const out = s.split(' ').filter((t) => t && !NAME_STOP.has(t)).join(' ')
  return PLACEHOLDER.test(out) ? '' : out
}

/**
 * Two cleaned names are one operator when (E rules 5–6): identical; one is a
 * prefix of the other; they share ≥67% of the shorter name's words; their
 * sequence similarity is ≥85%; or, spaces removed, both are ≥6 characters
 * and share their first 6.
 */
export function sameOperator(a: string, b: string): boolean {
  if (!a || !b) return a === b
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true
  const ta = new Set(a.split(' '))
  const tb = new Set(b.split(' '))
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  if (shared / Math.max(1, Math.min(ta.size, tb.size)) >= 0.67) return true
  if (sequenceRatio(a, b) >= 0.85) return true
  const sa = a.replace(/ /g, '')
  const sb = b.replace(/ /g, '')
  return sa.length >= 6 && sb.length >= 6 && sa.slice(0, 6) === sb.slice(0, 6)
}

/** One inspection record's name at a storefront. */
export interface Sighting {
  name: string
  /** 'YYYY-MM-DD' */
  date: string
  era: InspectionEra
}

export interface OperatorGroup {
  /** The raw name most often written on this operator's records (ties → alphabetical). */
  name: string
  /** Cleaned names folded into this operator. */
  names: string[]
  firstDate: string
  lastDate: string
  /** Distinct inspection dates, ascending. */
  dateList: string[]
  eras: InspectionEra[]
  seenOnce: boolean
}

/**
 * Fold a storefront's sightings into operators. Cleaned names are clustered
 * longest-first (ties alphabetical, so the result never depends on input
 * order): each joins the first cluster holding a `sameOperator` match, else
 * starts its own. Placeholder sightings are dropped. Sorted by firstDate.
 */
export function groupOperators(sightings: readonly Sighting[]): OperatorGroup[] {
  const cleaned = sightings
    .map((s) => ({ ...s, clean: cleanOperatorName(s.name), date: s.date.slice(0, 10) }))
    .filter((s) => s.clean)
  const distinct = [...new Set(cleaned.map((s) => s.clean))].sort(
    (x, y) => y.length - x.length || (x < y ? -1 : x > y ? 1 : 0),
  )
  const clusters: string[][] = []
  for (const n of distinct) {
    const home = clusters.find((c) => c.some((m) => sameOperator(n, m)))
    if (home) home.push(n)
    else clusters.push([n])
  }
  const groups = clusters.map((names): OperatorGroup => {
    const member = new Set(names)
    const rows = cleaned.filter((s) => member.has(s.clean))
    const dateList = [...new Set(rows.map((r) => r.date))].sort()
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1)
    const name = [...counts].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))[0][0]
    return {
      name,
      names: [...names].sort(),
      firstDate: dateList[0],
      lastDate: dateList[dateList.length - 1],
      dateList,
      eras: [...new Set(rows.map((r) => r.era))].sort((x, y) => x - y),
      seenOnce: dateList.length === 1,
    }
  })
  return groups.sort((x, y) => (x.firstDate < y.firstDate ? -1 : x.firstDate > y.firstDate ? 1 : 0) ||
    (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
}

// ── eligibility ────────────────────────────────────────────────────────

/** Overlap in days between two operators' active spans (negative = a gap). */
function overlapDays(a: OperatorGroup, b: OperatorGroup): number {
  const start = a.firstDate > b.firstDate ? a.firstDate : b.firstDate
  const end = a.lastDate < b.lastDate ? a.lastDate : b.lastDate
  return daysBetween(start, end)
}

/**
 * Rule 2 — the single-tenant test. A door is multi-tenant (a hotel, mall,
 * stadium; 249 flagged, E rule 2 / T6) if ANY of:
 *   · 3+ operators active at once, each overlapping by more than 60 days
 *     (an operator counts toward its own tally only when its span > 60 days —
 *     the probe's arithmetic, kept so the flag count reproduces);
 *   · 3+ operators inspected on one day;
 *   · 2 operators inspected on the same day on 2+ different dates.
 */
export function isMultiTenant(ops: readonly OperatorGroup[]): boolean {
  for (const a of ops) {
    let n = 0
    for (const b of ops) if (overlapDays(a, b) > 60) n++
    if (n >= 3) return true
  }
  const byDate = new Map<string, number>()
  for (const op of ops) for (const d of op.dateList) byDate.set(d, (byDate.get(d) ?? 0) + 1)
  let sharedDates = 0
  for (const n of byDate.values()) {
    if (n >= 3) return true
    if (n >= 2) sharedDates++
  }
  return sharedDates >= 2
}

export type TurnoverExclusion = 'not-storefront' | 'venue' | 'multi-tenant' | 'non-storefront-permits'

/**
 * Rules 1–4 in order; null when the door is eligible for turnover.
 * `nonStorefrontShare` is the share of the door's 2024+ inspection rows whose
 * permit is not a storefront class (foodPermits.ts); null when unknown.
 */
export function turnoverExclusion(input: {
  key: string
  multiTenant: boolean
  nonStorefrontShare: number | null
}): TurnoverExclusion | null {
  if (!isStorefrontAddress(input.key)) return 'not-storefront'
  if (isVenue(input.key)) return 'venue'
  if (input.multiTenant) return 'multi-tenant'
  if (input.nonStorefrontShare !== null && input.nonStorefrontShare >= 0.5) return 'non-storefront-permits'
  return null
}

// ── the chain ──────────────────────────────────────────────────────────

/** The chain's overlap tolerance: a successor may open up to 60 days before
 *  its predecessor's last inspection (records lag; handovers overlap). */
export const CHAIN_SLACK_DAYS = 60
/** The ghost rule's registry-tenure floor (E T9). */
export const GHOST_TENURE_DAYS = 90

/**
 * The longest no-overlap succession (rule 5): greedy by last date, the
 * optimal interval-scheduling order. Each next operator's first date must be
 * later than the previous one's last date minus the slack. Input order does
 * not matter; output is in succession order.
 */
export function longestChain<T extends { firstDate: string; lastDate: string }>(
  ops: readonly T[],
  slackDays: number = CHAIN_SLACK_DAYS,
): T[] {
  const sorted = [...ops].sort((x, y) =>
    (x.lastDate < y.lastDate ? -1 : x.lastDate > y.lastDate ? 1 : 0) ||
    (x.firstDate < y.firstDate ? -1 : x.firstDate > y.firstDate ? 1 : 0))
  const chain: T[] = []
  for (const op of sorted) {
    const last = chain[chain.length - 1]
    if (!last || daysBetween(last.lastDate, op.firstDate) > -slackDays) chain.push(op)
  }
  return chain
}

/** Rule 6 — the ghost rule: an operator counts toward `chainStrict` only with
 *  2+ inspection dates or ≥90 days of registry tenure. */
export function isStrictOperator(op: { dateList: readonly string[] }, registryTenureDays: number | null): boolean {
  return op.dateList.length >= 2 || (registryTenureDays ?? 0) >= GHOST_TENURE_DAYS
}

/** Rule 7 — the bar: a strict chain of 3+ whose operators span 2+ eras. */
export function meetsTurnoverBar(strictChain: readonly { eras: readonly InspectionEra[] }[]): boolean {
  if (strictChain.length < 3) return false
  const eras = new Set<InspectionEra>()
  for (const op of strictChain) for (const e of op.eras) eras.add(e)
  return eras.size >= 2
}

/**
 * Rule 8 — the owner-resolution bucket, from the owners of record of the
 * strict chain IN SUCCESSION ORDER (an owner-group key per operator; null
 * where no registry row matched). Unresolved operators are skipped: the
 * sequence is what the registry can vouch for. First match wins:
 *
 *   owners-unknown  fewer than 2 operators resolved
 *   owner-returned  an owner left, a DIFFERENT owner followed, and the first
 *                   came back (2077 Hayes: Red Smart LLC → … → Red Smart LLC).
 *                   Never labelled "same owner".
 *   same-owner      two successive names under ONE owner — at least one name
 *                   change was not an ownership change (570 Green, 1055
 *                   Taraval, 1800 Fillmore)
 *   three-owners    3+ distinct owners, each name its own owner
 *   owners-unknown  (again) exactly two different owners resolved with the
 *                   rest unmatched — the registry cannot say whether the
 *                   parade was two owners or three, so no claim is made.
 */
export function turnoverBucket(ownerKeys: readonly (string | null)[]): TurnoverBucket {
  const seq = ownerKeys.filter((k): k is string => !!k)
  if (seq.length < 2) return 'owners-unknown'
  const runs: string[] = []
  let adjacentSame = false
  for (const k of seq) {
    if (runs[runs.length - 1] === k) adjacentSame = true
    else runs.push(k)
  }
  if (new Set(runs).size < runs.length) return 'owner-returned'
  if (adjacentSame) return 'same-owner'
  if (runs.length >= 3) return 'three-owners'
  return 'owners-unknown'
}
