// src/views/Restaurants/storylineRows.ts
//
// The rows behind the Storylines rail (StorylineRail.tsx) — pure, so each
// list's membership and order is pinned by test against the committed
// snapshot. The rail component itself imports MapSidebar → appStore, which
// the node-only Vitest cannot load; everything worth testing lives here.
//
// Rules carried from the spec (§4.4 as amended by §11):
//   · Turnover: storefronts that meet the bar, ranked by strict chain length.
//     Names are shown as the inspection records wrote them; one-timers stay
//     in the chain, marked, never dropped.
//   · Closures: "Closed more than once since 2020" is the REPEAT BAR, per
//     permit / facility (episodes <30 days apart merge FOR THE BAR only) —
//     every row carries its episodes' outcomes. A storefront never inherits a
//     closure: a row names the business that was operating when it was shut.
//   · Neighborhood rates: places closed ÷ places inspected, never raw counts;
//     under MIN_RATED places inspected → "too few inspected to rate".
//   · Owners: closures travel WITH a denominator ("2 closures across 21
//     storefronts"), and no list is ever sorted by closures (no league table).
//   · The live every-closure list shows an address only when the permit
//     resolves to a mapped storefront. Trucks, carts and cottage-food home
//     kitchens are counted but never located (their address can be a home).

import type {
  ClosureEpisode as SnapshotEpisode,
  FranchiseBrand,
  GroupEvidenceKind,
  SharedMailingAddress,
  Storefront,
  StorefrontOperator,
  StorefrontSnapshot,
  TurnoverBucket,
  VisibleOwner,
} from '@/lib/storefronts/types'
import { ownerGroupKey } from '@/lib/storefronts/ownerGroups'
import { repeatBarCount, type ClosureEpisode } from './closureEpisodes'
import { currentOperator, displayName } from './mapLayers'

// ── names ──────────────────────────────────────────────────────────────────

/** Title-cases an ALL-CAPS trade name ('SEVEN STILLS' → 'Seven Stills'); a
 *  mixed-case name keeps the record's own casing. ONE authority for the view
 *  (mapLayers.ts) — re-exported so the rail, the lookup and the live closure
 *  list can never render one business two ways. */
export { displayName }

// ── turnover ───────────────────────────────────────────────────────────────

export const BUCKET_ORDER: readonly TurnoverBucket[] = ['three-owners', 'same-owner', 'owner-returned', 'owners-unknown']

/** Chip labels. What each bucket means precisely is data-notes copy (BUCKET_NOTE). */
export const BUCKET_LABEL: Readonly<Record<TurnoverBucket, string>> = {
  'three-owners': 'Three or more owners',
  'same-owner': 'Same owner, new names',
  'owner-returned': 'Owner came back',
  'owners-unknown': 'Owners not matched',
}

/** Legend labels under the bucket bar (the chip row became a legend, Sept.
 *  2026); BUCKET_LABEL is the long form the aria-label keeps. */
export const BUCKET_SHORT: Readonly<Record<TurnoverBucket, string>> = {
  'three-owners': '3+ owners',
  'same-owner': 'Same owner',
  'owner-returned': 'Owner returned',
  'owners-unknown': 'Not matched',
}

/** The precision behind the four chips. */
export const BUCKET_NOTE =
  'Owners come from the city business registry, matched to each business name by address, name and the dates ' +
  'it was registered there. “Three or more owners”: at least three different registered owners in turn. “Same ' +
  'owner, new names”: the sign changed but one registered owner held the address across the change. “Owner came ' +
  'back”: an owner left, others followed, and the first returned. “Owners not matched”: fewer than two of the ' +
  'names matched a registration, so the registry cannot say.'

/** `?bucket=` → a bucket; anything else → null (all buckets). */
export function parseBucket(raw: string | null | undefined): TurnoverBucket | null {
  return BUCKET_ORDER.includes(raw as TurnoverBucket) ? (raw as TurnoverBucket) : null
}

export function bucketCounts(snapshot: StorefrontSnapshot): Record<TurnoverBucket, number> {
  const out: Record<TurnoverBucket, number> = { 'three-owners': 0, 'same-owner': 0, 'owner-returned': 0, 'owners-unknown': 0 }
  for (const s of snapshot.storefronts) if (s.turnoverBucket) out[s.turnoverBucket]++
  return out
}

/** The chain drawn inline: operators in the longest no-overlap sequence,
 *  oldest first ('Almanac → Seven Stills → Brewvino → …'). */
export function chainOperators(s: Storefront): StorefrontOperator[] {
  const chain = s.operators.filter((o) => o.inChain)
  return (chain.length ? chain : s.operators).slice().sort((a, b) => cmp(a.firstDate, b.firstDate))
}

const lastSeen = (s: Storefront): string => s.operators.reduce((m, o) => (o.lastDate > m ? o.lastDate : m), '')

/** A Turnover row, current business first (Jesse, Sept. 25 2026: "more
 *  hierarchy toward the current establishment"). `current` = the operator
 *  seen LAST (the map's currentOperator rule); `isNow` only when that
 *  operator appears in the live 2024+ records — an older last sighting is
 *  labelled "Last", never "Now", so the row never claims a place is open.
 *  `earlier` = the rest of the chain, oldest first, for the turn-down. */
export interface TurnoverRowModel {
  current: StorefrontOperator | null
  isNow: boolean
  earlier: StorefrontOperator[]
  /** Names counted (the strict chain) — the figure on the row's right. */
  names: number
}

export function turnoverRowModel(s: Storefront): TurnoverRowModel {
  const chain = chainOperators(s)
  const current = chain.length ? chain.reduce((m, o) => (o.lastDate > m.lastDate ? o : m)) : null
  return {
    current,
    isNow: current !== null && current.eras.includes(2024),
    earlier: chain.filter((o) => o !== current),
    names: s.chainStrict,
  }
}

/** Storefronts meeting the turnover bar, optionally one bucket, ranked by
 *  strict chain length → all-sightings chain → most recently seen → address. */
export function turnoverRows(snapshot: StorefrontSnapshot, bucket: TurnoverBucket | null): Storefront[] {
  return snapshot.storefronts
    .filter((s) => s.turnoverBucket !== null && (bucket === null || s.turnoverBucket === bucket))
    .sort(
      (a, b) =>
        b.chainStrict - a.chainStrict ||
        b.chainAll - a.chainAll ||
        cmp(lastSeen(b), lastSeen(a)) ||
        cmp(a.address, b.address),
    )
}

// ── closures (snapshot) ────────────────────────────────────────────────────

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A snapshot episode in the shape the episode rule and phrase helpers take. */
export function toEpisode(e: SnapshotEpisode): ClosureEpisode {
  return {
    key: e.permit,
    start: e.start,
    clearedOn: e.clearedOn,
    days: e.days,
    closureVisits: e.closureVisits,
    closureDates: [],
    sameDay: e.sameDay,
    afterBreak: e.afterBreak,
  }
}

/** The operator whose inspection span holds `date`; else the latest one that
 *  had started by then; else the first. Names the business AS IT WAS when a
 *  closure happened (D5 — a storefront never inherits a closure). */
export function operatorAt(s: Storefront, date: string): StorefrontOperator | null {
  const ops = s.operators
  if (!ops.length) return null
  const within = ops.filter((o) => o.firstDate <= date && date <= o.lastDate)
  if (within.length) return within.reduce((m, o) => (o.firstDate > m.firstDate ? o : m))
  const started = ops.filter((o) => o.firstDate <= date)
  if (started.length) return started.reduce((m, o) => (o.firstDate > m.firstDate ? o : m))
  return ops[0]
}

/** The current tenant — re-exported from the mapLayers leaf, its one home. */
export { currentOperator }

export interface RepeatRow {
  storefront: Storefront
  /** Permit (2024+) or facility id (2020–23) the episodes share. */
  permit: string
  era: 2020 | 2024
  /** Every episode on that permit, oldest first — the list shows them all. */
  episodes: ClosureEpisode[]
  /** Episodes counted for the bar (runs <30 days apart merged). */
  barCount: number
  /** The business operating at the latest closure. */
  name: string
  latestStart: string
}

/** "Closed more than once since 2020": one row per permit / facility id that
 *  meets the repeat bar, most episodes first, then most recent. */
export function repeatClosureRows(snapshot: StorefrontSnapshot): RepeatRow[] {
  const rows: RepeatRow[] = []
  for (const s of snapshot.storefronts) {
    if (!s.episodes.length) continue
    const byPermit = new Map<string, SnapshotEpisode[]>()
    for (const e of s.episodes) {
      const k = `${e.era}|${e.permit}`
      const list = byPermit.get(k)
      if (list) list.push(e)
      else byPermit.set(k, [e])
    }
    for (const list of byPermit.values()) {
      const episodes = list.map(toEpisode).sort((a, b) => cmp(a.start, b.start))
      const barCount = repeatBarCount(episodes)
      if (barCount < 2) continue
      const latestStart = episodes[episodes.length - 1].start
      rows.push({
        storefront: s,
        permit: list[0].permit,
        era: list[0].era,
        episodes,
        barCount,
        name: displayName(operatorAt(s, latestStart)?.name ?? s.address),
        latestStart,
      })
    }
  }
  return rows.sort((a, b) => b.barCount - a.barCount || b.episodes.length - a.episodes.length || cmp(b.latestStart, a.latestStart))
}

/** The Closures lede's two figures, 2024+ episodes at the storefronts in the
 *  file — ONE scope for both numbers (never mixed with the citywide stats). */
export function closureLedeFigures(snapshot: StorefrontSnapshot): { cleared: number; clearedWithinADay: number } {
  let cleared = 0
  let clearedWithinADay = 0
  for (const s of snapshot.storefronts) {
    for (const e of s.episodes) {
      if (e.era !== 2024 || e.clearedOn === null) continue
      cleared++
      if (e.sameDay || (e.days !== null && e.days <= 1)) clearedWithinADay++
    }
  }
  return { cleared, clearedWithinADay }
}

/** The Closures chip's histogram bins, in drawing order. The last bin is the
 *  hatch idiom — no later record, never "still closed". */
export const DURATION_BIN_ORDER = ['same-day', 'one-day', 'week', 'month', 'longer', 'no-record'] as const
export type DurationBin = (typeof DURATION_BIN_ORDER)[number]

export const DURATION_BIN_LABEL: Readonly<Record<DurationBin, string>> = {
  'same-day': 'same day',
  'one-day': '1 day',
  week: '≤7 days',
  month: '≤30 days',
  longer: 'longer',
  'no-record': 'no later record',
}

/** Which bin one episode falls in — the SAME reading as closureLedeFigures
 *  (same day or `days` ≤ 1 is "within a day"), so the bins and the chip's
 *  numeral can never disagree. */
export function durationBin(e: Pick<SnapshotEpisode, 'clearedOn' | 'days' | 'sameDay'>): DurationBin {
  if (e.sameDay) return 'same-day'
  if (e.clearedOn === null || e.days === null) return 'no-record'
  if (e.days <= 1) return 'one-day'
  if (e.days <= 7) return 'week'
  if (e.days <= 30) return 'month'
  return 'longer'
}

/** Closure lengths, 2024+ episodes at the storefronts in the file — ONE scope
 *  with closureLedeFigures: the cleared bins sum to its `cleared`, and
 *  same-day + one-day equal its `clearedWithinADay`. */
export function closureDurationBins(snapshot: StorefrontSnapshot): Record<DurationBin, number> {
  const out: Record<DurationBin, number> = { 'same-day': 0, 'one-day': 0, week: 0, month: 0, longer: 0, 'no-record': 0 }
  for (const s of snapshot.storefronts) {
    for (const e of s.episodes) {
      if (e.era !== 2024) continue
      out[durationBin(e)]++
    }
  }
  return out
}

// ── closures (live, window-scoped) ─────────────────────────────────────────

/** One item of the hook's every-closure list. Tolerant by design: the episode
 *  fields come from closureEpisodes(); the permit may arrive as `key`,
 *  `permit` or `permit_number`; the name as `dba` or `name`. */
export interface LiveClosureItem {
  key?: string
  permit?: string
  permit_number?: string
  start: string
  clearedOn: string | null
  days: number | null
  sameDay: boolean
  afterBreak?: boolean
  closureVisits?: number
  closureDates?: string[]
  dba?: string | null
  name?: string | null
}

export interface ClosureListRow {
  id: string
  permit: string
  episode: ClosureEpisode
  name: string
  /** Mapped storefront, when the permit is one; null = counted, never located. */
  storefront: Storefront | null
}

/** permit number → the storefront it was seen at. */
export function permitIndex(snapshot: StorefrontSnapshot): Map<string, Storefront> {
  const m = new Map<string, Storefront>()
  for (const s of snapshot.storefronts) for (const p of s.permits) if (!m.has(p)) m.set(p, s)
  return m
}

/** Newest first; ties by name. */
export function closureListRows(items: readonly LiveClosureItem[], byPermit: Map<string, Storefront>): ClosureListRow[] {
  const rows = items.map((it): ClosureListRow => {
    const permit = String(it.key ?? it.permit ?? it.permit_number ?? '')
    const storefront = byPermit.get(permit) ?? null
    const recorded = it.dba ?? it.name ?? null
    const name = displayName(recorded || (storefront ? (operatorAt(storefront, it.start.slice(0, 10))?.name ?? '') : '')) || `Permit ${permit}`
    return {
      id: `${permit}|${it.start}`,
      permit,
      name,
      storefront,
      episode: {
        key: permit,
        start: it.start.slice(0, 10),
        clearedOn: it.clearedOn ? it.clearedOn.slice(0, 10) : null,
        days: it.days,
        closureVisits: it.closureVisits ?? it.closureDates?.length ?? 1,
        closureDates: it.closureDates ?? [],
        sameDay: it.sameDay,
        afterBreak: it.afterBreak ?? false,
      },
    }
  })
  return rows.sort((a, b) => cmp(b.episode.start, a.episode.start) || cmp(a.name, b.name))
}

// ── neighborhood rates ─────────────────────────────────────────────────────

/** Fewer places inspected than this → "too few inspected to rate". */
export const MIN_RATED = 50

export type RateBy = 'closed' | 'yellow'

export interface RateRow {
  nhood: string
  closed: number
  yellow: number
  inspected: number
  /** closed ÷ inspected; null when unrated. */
  closedShare: number | null
  yellowShare: number | null
  rated: boolean
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toRate(nhood: string, closed: number, yellow: number, inspected: number): RateRow {
  const rated = inspected >= MIN_RATED
  return {
    nhood,
    closed,
    yellow,
    inspected,
    closedShare: rated ? closed / inspected : null,
    yellowShare: rated ? yellow / inspected : null,
    rated,
  }
}

/** Q2's rows (Socrata serializes counts as strings; the neighborhood column
 *  may arrive as `analysis_neighborhood`, `nhood` or `neighborhood`). Rows
 *  with no neighborhood are dropped from the table — they still count in
 *  citywideRate, which the caller builds from the RAW rows. */
export function normalizeRates(raw: readonly Record<string, unknown>[] | null | undefined): RateRow[] {
  if (!raw) return []
  const out: RateRow[] = []
  for (const r of raw) {
    const nhood = String(r.analysis_neighborhood ?? r.nhood ?? r.neighborhood ?? '').trim()
    if (!nhood) continue
    out.push(toRate(nhood, num(r.closed), num(r.yellow), num(r.inspected)))
  }
  return out
}

/** Citywide figures from every Q2 row, neighborhood or not. A permit sits in
 *  one neighborhood, so the per-neighborhood distinct counts sum to the
 *  citywide distinct count. */
export function citywideRate(raw: readonly Record<string, unknown>[] | null | undefined): RateRow {
  let closed = 0
  let yellow = 0
  let inspected = 0
  for (const r of raw ?? []) {
    closed += num(r.closed)
    yellow += num(r.yellow)
    inspected += num(r.inspected)
  }
  return toRate('Citywide', closed, yellow, inspected)
}

/** Rated rows by the chosen share (highest first), then the unrated ones by name. */
export function sortRates(rows: readonly RateRow[], by: RateBy): RateRow[] {
  const share = (r: RateRow) => (by === 'closed' ? r.closedShare : r.yellowShare) ?? -1
  return rows.slice().sort((a, b) => {
    if (a.rated !== b.rated) return a.rated ? -1 : 1
    return share(b) - share(a) || cmp(a.nhood, b.nhood)
  })
}

/** [min, max] of the chosen share across rated rows — the PositionScale range. */
export function shareRange(rows: readonly RateRow[], by: RateBy): [number, number] {
  const vals = rows.flatMap((r) => {
    const v = by === 'closed' ? r.closedShare : r.yellowShare
    return v === null ? [] : [v]
  })
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1]
}

/** "6.7%". */
export function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

// ── owners ─────────────────────────────────────────────────────────────────

/** Ranked owners (company, 3+ storefronts) and the folded contract operators. */
export function ownerLists(snapshot: StorefrontSnapshot): { ranked: VisibleOwner[]; contract: VisibleOwner[] } {
  const bySize = (a: VisibleOwner, b: VisibleOwner) => b.storefronts.length - a.storefronts.length || cmp(a.name, b.name)
  return {
    ranked: snapshot.owners.filter((o) => o.contract === null).sort(bySize),
    contract: snapshot.owners.filter((o) => o.contract !== null).sort(bySize),
  }
}

export interface OwnerClosureTally {
  /** Closure episodes since 2020 under this owner's business names. */
  closures: number
  /** The denominator: the owner's storefronts that are on the map (in the
   *  file). Registry addresses the inspection records never place — or that
   *  DataDiver leaves out — cannot be checked, so they are not claimed. */
  checked: number
  /** Every storefront the owner is registered at. */
  storefronts: number
}

/**
 * Closures WITH their denominator for one owner (§11: owner lists show
 * closures with denominators; never a ranking by them). An episode counts
 * when it falls inside the inspection span of an operator at one of the
 * owner's storefronts whose registered owner is this owner (same
 * ownerGroupKey). Measured 2026-09-24: 399 of the 769 owner storefronts are
 * in the file, so the denominator is the CHECKED storefronts, never all.
 */
export function ownerClosureTally(owner: VisibleOwner, byKey: Map<string, Storefront>): OwnerClosureTally {
  const want = ownerGroupKey(owner.name)
  let closures = 0
  let checked = 0
  for (const key of owner.storefronts) {
    const s = byKey.get(key)
    if (!s) continue
    checked++
    if (!s.episodes.length) continue
    const spans = s.operators.filter((o) => o.owner !== null && ownerGroupKey(o.owner.name) === want)
    if (!spans.length) continue
    for (const e of s.episodes) if (spans.some((o) => o.firstDate <= e.start && e.start <= o.lastDate)) closures++
  }
  return { closures, checked, storefronts: owner.storefronts.length }
}

/** "Two closures since 2020 across its four storefronts on the map" /
 *  "No closures since 2020 across 12 of its 31 storefronts on the map";
 *  null when none of its storefronts is on the map (nothing was checked). */
export function ownerClosuresPhrase(t: OwnerClosureTally): string | null {
  if (t.checked === 0) return null
  const head = t.closures === 0 ? 'No closures' : `${countStart(t.closures)} ${t.closures === 1 ? 'closure' : 'closures'}`
  const scope = t.checked === t.storefronts ? `its ${count(t.checked)}` : `${count(t.checked)} of its ${count(t.storefronts)}`
  return `${head} since 2020 across ${scope} ${t.checked === 1 && t.storefronts === 1 ? 'storefront' : 'storefronts'} on the map`
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const count = (n: number): string => (n >= 0 && n < 10 ? SMALL[n] : n.toLocaleString('en-US'))
const countStart = (n: number): string => {
  const w = count(n)
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** One sign, many owners — most owners first. */
export function franchiseRows(snapshot: StorefrontSnapshot): FranchiseBrand[] {
  return snapshot.franchises
    .slice()
    .sort((a, b) => b.owners.length - a.owners.length || b.locations - a.locations || cmp(a.brand, b.brand))
}

/** Shared mailing addresses (the FACT) — most companies first. */
export function sharedAddressRows(snapshot: StorefrontSnapshot): SharedMailingAddress[] {
  return snapshot.sharedAddresses
    .slice()
    .sort((a, b) => b.companies.length - a.companies.length || b.storefronts.length - a.storefronts.length || cmp(a.address, b.address))
}

/** storefront key → storefront. */
export function storefrontIndex(snapshot: StorefrontSnapshot): Map<string, Storefront> {
  return new Map(snapshot.storefronts.map((s) => [s.key, s]))
}

/** Share of permitted storefronts whose current operator matched a registry
 *  owner — the Owners note's percentage. Prefers the generator's own pinned
 *  figure (`stats.registryMatch`) when the file carries it. */
export function registryMatchPct(snapshot: StorefrontSnapshot): number {
  const stats = snapshot.stats
  const rm = stats?.registryMatch
  if (rm && rm.total > 0) return (rm.matched / rm.total) * 100
  let total = 0
  let matched = 0
  for (const s of snapshot.storefronts) {
    if (!s.permits.length) continue
    const cur = currentOperator(s)
    if (!cur) continue
    total++
    if (cur.owner) matched++
  }
  return total ? (matched / total) * 100 : 0
}

// ── the rail's own data notes (banned-word tested in storylineRows.test.ts) ─

/** Behind the turnover chain's marks. */
export const CHAIN_NOTE =
  'Each chain lists the business names on city inspection records at this address, oldest first, as the ' +
  'records wrote them. A name that appears at a single inspection is marked and set in italics; it counts ' +
  'toward the number only when the business registry shows it registered there for 90 days or more. ' +
  'Names that changed only slightly (a dropped “Inc.”, a spelling) are treated as one business.'

/** Behind "Closed more than once since 2020". */
export const REPEAT_NOTE =
  'A closure runs from the first inspection that closed a place to the next inspection it passed; the ' +
  'inspections in between that found it closed are the same closure. This list counts closures per health ' +
  'permit (per facility for 2020–23 records) from March 2020, and two closures less than 30 days apart count ' +
  'once here — the storefront’s own page still shows each. A closure belongs to the business that held the ' +
  'permit, never to a later tenant. Food halls, stadiums and shared kitchens are left out.'

/** Behind the Closures lede's figures. */
export const CLOSURE_LEDE_NOTE =
  'The figures above count closures since January 2024 at the storefronts on this map; food halls, stadiums, ' +
  'shared kitchens, trucks and carts are left out.'

/** Behind "Every closure, newest first". */
export const CLOSURE_LIST_NOTE =
  'Every closure that began in the chosen window, from the city’s current inspection records. Food trucks, carts ' +
  'and home kitchens are listed by name only and never located: their permit address can be a home.'

/** Behind each owner's closure figure. */
export const OWNER_CLOSURES_NOTE =
  'The figure beside each owner is the number of storefronts it is registered at. Its closures count every ' +
  'closure since 2020 while one of its registered businesses operated there, at the storefronts on the map ' +
  'only: some registry addresses never appear on inspection records under the same address, and DataDiver ' +
  'leaves out food halls, stadiums and buildings with many kitchens, so the line says how many storefronts ' +
  'were checked. Owners are listed by size, never ranked by closures: there are too few closures to compare ' +
  'owners fairly.'

/** Behind "One sign, many owners". */
export const FRANCHISE_NOTE =
  'Brands are grouped by the trade name on open city business registrations, so the same sign run by ' +
  'different registered owners appears once, with every owner listed as the registry names them. A shared ' +
  'name does not by itself show a franchise: independent businesses sometimes share a common name.'

const EVIDENCE_PHRASE: Readonly<Record<GroupEvidenceKind, string>> = {
  'registry-mailing-address': 'the city business registry',
  'shared-trade-name': 'shared trade names',
  'group-website': 'the group’s own website',
  'abc-licensee-address': 'state liquor license records',
  'sos-agent-address': 'Secretary of State filings',
}

/** The sources the curated groups were checked against, for sameMailingNote's
 *  "{evidence}" — undefined while no group is curated (the claim is absent). */
export function groupEvidencePhrase(groups: readonly { evidence: readonly { kind: GroupEvidenceKind }[] }[]): string | undefined {
  const kinds = new Set<GroupEvidenceKind>()
  for (const g of groups) for (const e of g.evidence) kinds.add(e.kind)
  const phrases = (Object.keys(EVIDENCE_PHRASE) as GroupEvidenceKind[]).filter((k) => kinds.has(k)).map((k) => EVIDENCE_PHRASE[k])
  if (!phrases.length) return undefined
  return phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}
