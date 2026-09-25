// src/views/Restaurants/storefrontBiography.ts
//
// The storefront biography's model (spec §4.5 as amended by §11). Pure: the
// panel and the ribbon render what this derives from the committed snapshot
// plus the live 2024+ lane (Q4), and the tests pin it.
//
// Rules carried here, each from the spec:
//   · A storefront never inherits a closure (D5) — the episodes listed are the
//     door's own, each attributed to the business on the records at the time.
//   · The live lane WINS over the snapshot for 2024+ episodes, and the panel
//     says "updated since {asOf}" when they differ (§4.5 item 4).
//   · Owner names are shown for every owner (§11); `kind` decides only the
//     /business/owner/ link (companies only) and address display.
//   · "Same owner as before" / "owner came back" are read off the registry's
//     owner of record per operator — never off a name that merely looks alike
//     (§3.7 rule 8; 2077 Hayes St is the pinned "came back").
//   · Inspectors are shown per inspection and never ranked: nothing here
//     groups, sorts or counts by inspector.

import { apDate } from '@/utils/apDate'
import { toTitleCase } from '@/utils/format'
import { ownerGroupKey } from '@/lib/storefronts/ownerGroups'
import type {
  ClosureEpisode as SnapshotEpisode,
  CuratedGroup,
  SharedMailingAddress,
  SnapshotGroup,
  Storefront,
  StorefrontOperator,
  StorefrontOwner,
  StorefrontSnapshot,
  VisibleOwner,
} from '@/lib/storefronts/types'
import { closureEpisodes, type ClosureEpisode } from './closureEpisodes'
import { currentOperator } from './mapLayers'
import { normalizePlacard, PLACARD_RANK, PLACARD_WORD, type Placard } from './placard'
import { nowLine, monthYearShort } from './restaurantPhrase'
import {
  parseViolationItems,
  VIOLATION_FAMILIES,
  violationFamilies,
  type ViolationFamilyId,
  type ViolationItem,
} from './violationFamilies'

// ── links ──────────────────────────────────────────────────────────────────

/** The city's own "Inspection lookup tool" — linked from tvy3-wexg's
 *  description on data.sf.gov (checked 2026-09-24). */
export const DPH_LOOKUP_URL = 'https://inspections.myhealthdepartment.com/san-francisco'
/** The business registry (g8m3-pdis) — where every withheld field is published. */
export const REGISTRY_URL = 'https://data.sf.gov/d/g8m3-pdis'
/** The 2024+ inspection dataset (tvy3-wexg). */
export const INSPECTIONS_URL = 'https://data.sf.gov/d/tvy3-wexg'

/** Business Search's owner dossier — companies only (§11: never a tool that
 *  turns a person's name into their holdings). null for anyone else. */
export function businessOwnerHref(owner: Pick<StorefrontOwner, 'name' | 'kind'> | null | undefined): string | null {
  if (!owner || owner.kind !== 'company' || !owner.name.trim()) return null
  return `/business/owner/${encodeURIComponent(owner.name)}`
}

// ── names + dates ──────────────────────────────────────────────────────────

/** A business (dba) name for display. DPH writes many in ALL CAPS
 *  ('THE HUNGRY SPOT'); those are title-cased. Mixed-case names stay as
 *  written. OWNER names never pass through here — they print exactly as the
 *  registry publishes them. */
export function displayBusinessName(name: string | null | undefined): string {
  const s = (name ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return /[a-z]/.test(s) ? s : toTitleCase(s)
}

/** "Nov. 2016 – Aug. 2018", or one month when both ends share it. */
export function operatorSpan(op: Pick<StorefrontOperator, 'firstDate' | 'lastDate'>): string {
  const a = monthYearShort(op.firstDate)
  const b = monthYearShort(op.lastDate)
  return a === b ? a : `${a} – ${b}`
}

/** An owner's registration years at this storefront: "2016–2019", or
 *  "since 2024" while the registration is open. '' when the registry row
 *  carried no start date. */
export function ownerYears(owner: Pick<StorefrontOwner, 'registeredFrom' | 'registeredTo'>): string {
  const from = owner.registeredFrom?.slice(0, 4)
  if (!from) return ''
  if (!owner.registeredTo) return `since ${from}`
  const to = owner.registeredTo.slice(0, 4)
  return from === to ? from : `${from}–${to}`
}

// ── owner continuity chips ─────────────────────────────────────────────────

export type OwnerChip = 'same-owner' | 'owner-returned' | null

/** One chip per operator (same order), read off the registered owner:
 *    'same-owner'     — the same owner as the most recent earlier operator
 *                       whose owner the registry resolved;
 *    'owner-returned' — a different owner came between, and this one had
 *                       run the storefront before (2077 Hayes St);
 *    null             — first seen, a new owner, or no owner resolved. */
export function ownerChips(operators: readonly Pick<StorefrontOperator, 'owner'>[]): OwnerChip[] {
  const seen = new Set<string>()
  let prev: string | null = null
  return operators.map((op) => {
    const key = op.owner ? ownerGroupKey(op.owner.name) : ''
    if (!key) return null
    const chip: OwnerChip = key === prev ? 'same-owner' : seen.has(key) ? 'owner-returned' : null
    seen.add(key)
    prev = key
    return chip
  })
}

// ── the live 2024+ lane (Q4) ───────────────────────────────────────────────

/** One Q4 row as Socrata serializes it (every value a string). Permissive on
 *  purpose so the hook's own row type stays assignable. */
export interface InspectionRow {
  inspection_date?: string
  permit_number?: string
  permit_type?: string
  dba?: string
  inspection_type?: string | null
  facility_rating_status?: string | null
  violation_count?: string | number | null
  violation_codes?: string | null
  inspector?: string | null
}

const day = (s: string | undefined): string => (s ?? '').slice(0, 10)

/** Exact full-row duplicates collapse (137 in the extract, A trap 9); genuine
 *  same-day second visits — any field differing — are kept. Oldest first. */
export function dedupeLane(rows: readonly InspectionRow[]): InspectionRow[] {
  const seen = new Set<string>()
  const out: InspectionRow[] = []
  for (const r of rows) {
    if (!day(r.inspection_date)) continue
    const k = [
      day(r.inspection_date),
      r.permit_number,
      (r.dba ?? '').replace(/\s+/g, ' ').trim(),
      r.inspection_type ?? '',
      r.facility_rating_status ?? '',
      String(r.violation_count ?? ''),
      r.violation_codes ?? '',
      r.inspector ?? '',
    ].join('|')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out.sort((a, b) => cmp(day(a.inspection_date), day(b.inspection_date)))
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Violations recorded on a row (never a severity). null when unpublished. */
export function violationsRecorded(r: Pick<InspectionRow, 'violation_count'>): number | null {
  const n = Number(r.violation_count)
  return r.violation_count === null || r.violation_count === undefined || r.violation_count === '' || !Number.isFinite(n)
    ? null
    : n
}

// ── the latest reading (header "Now:" line) ────────────────────────────────

export interface LatestReading {
  era: 2016 | 2020 | 2024
  date: string
  name: string
  /** null for the score era, which published no placard. */
  placard: Placard | null
}

/** Best placard among a date's readings: a same-date Closure + Pass resolves
 *  to Pass = "cleared the same day" (spec §3.3 Q3b). */
function bestOn<T>(items: readonly T[], date: (t: T) => string, placard: (t: T) => Placard | null): T | null {
  let best: T | null = null
  for (const it of items) {
    const p = placard(it)
    if (!p) continue
    if (!best) {
      best = it
      continue
    }
    const d = date(it)
    const bd = date(best)
    if (d > bd || (d === bd && PLACARD_RANK[p] < PLACARD_RANK[placard(best)!])) best = it
  }
  return best
}

/** The storefront's latest published reading. `lane` null = the live lane is
 *  not available; then nothing is claimed for 2024+ UNLESS the storefront has
 *  no 2024+ permit at all (its records genuinely end earlier). */
export function latestReading(sf: Storefront, lane: readonly InspectionRow[] | null): LatestReading | null {
  const live = lane ?? (sf.permits.length === 0 ? [] : null)
  if (live === null) return null
  const r24 = bestOn(live, (r) => day(r.inspection_date), (r) => normalizePlacard(r.facility_rating_status))
  if (r24) {
    return { era: 2024, date: day(r24.inspection_date), name: displayBusinessName(r24.dba), placard: normalizePlacard(r24.facility_rating_status) }
  }
  const r20 = bestOn(sf.lanes.placards2020, (r) => r.date, (r) => normalizePlacard(r.status))
  if (r20) return { era: 2020, date: r20.date, name: displayBusinessName(r20.name), placard: normalizePlacard(r20.status) }
  const s16 = sf.lanes.scores2016.reduce<(typeof sf.lanes.scores2016)[number] | null>(
    (best, r) => (!best || r.date > best.date ? r : best),
    null,
  )
  if (s16) return { era: 2016, date: s16.date, name: displayBusinessName(s16.name), placard: null }
  return null
}

/** The header's status line. "Now:" only for a live-feed (2024+) reading —
 *  an older last record is dated, never presented as the present:
 *    "Now: Golden Flower · latest inspection June 13, 2025: green placard"
 *    "Last inspected Aug. 3, 2023, as Chubby Noodle: yellow placard"
 *    "Last inspected Nov. 28, 2019, as Katani Pizza" */
export function statusLine(r: LatestReading | null, nowYear: number): string | null {
  if (!r) return null
  if (r.era === 2024 && r.placard) return nowLine(r.name, r.date, r.placard, nowYear)
  const when = apDate(r.date, nowYear)
  // AP sets a year off with commas on both sides: "Aug. 3, 2023, as …".
  const who = r.name ? `${/\d{4}$/.test(when) ? ',' : ''} as ${r.name}` : ''
  return `Last inspected ${when}${who}${r.placard ? `: ${PLACARD_WORD[r.placard]}` : ''}`
}

// ── closure episodes, 2020 on ──────────────────────────────────────────────

export interface PanelEpisode {
  /** tvy3 permit (2024) or 5tti facility id (2020). */
  permit: string
  era: 2020 | 2024
  /** The closure-rule episode (closureEpisodes.ts shape) — what the phrase
   *  helpers take. */
  episode: ClosureEpisode
  /** The business on the records at the closure. */
  name: string | null
  familyIds: ViolationFamilyId[]
  /** The city's violation items at the closure visits (live lane only),
   *  suspension notice excluded. */
  items: ViolationItem[]
  /** The ~1,900-character suspension notice text, collapsed by the panel. */
  notices: string[]
}

export interface PanelEpisodes {
  /** Newest first. */
  episodes: PanelEpisode[]
  /** 2024+ episodes were recomputed from the live lane. */
  live: boolean
  /** The live recomputation differs from the snapshot's — "updated since {asOf}". */
  updatedSinceAsOf: boolean
}

const KNOWN_FAMILY = new Set<string>(VIOLATION_FAMILIES.map((f) => f.id))

const asRuleEpisode = (e: SnapshotEpisode): ClosureEpisode => ({
  key: e.permit,
  start: e.start,
  clearedOn: e.clearedOn,
  days: e.days,
  closureVisits: e.closureVisits,
  closureDates: [e.start],
  sameDay: e.sameDay,
  afterBreak: e.afterBreak,
})

/** The operator whose inspection dates cover `date` (latest-starting wins). */
function operatorAt(sf: Storefront, date: string): string | null {
  let hit: StorefrontOperator | null = null
  for (const op of sf.operators) if (op.firstDate <= date && date <= op.lastDate && (!hit || op.firstDate > hit.firstDate)) hit = op
  return hit ? displayBusinessName(hit.name) : null
}

function snapshotEpisode(sf: Storefront, e: SnapshotEpisode): PanelEpisode {
  const name =
    e.era === 2020
      ? displayBusinessName(sf.lanes.placards2020.find((r) => r.facility === e.permit && r.date === e.start)?.name) ||
        operatorAt(sf, e.start)
      : operatorAt(sf, e.start)
  return {
    permit: e.permit,
    era: e.era,
    episode: asRuleEpisode(e),
    name: name || null,
    familyIds: e.familyIds.filter((id): id is ViolationFamilyId => KNOWN_FAMILY.has(id) && id !== 'closure-notice'),
    items: [],
    notices: [],
  }
}

function liveEpisode(ep: ClosureEpisode, rows: readonly InspectionRow[]): PanelEpisode {
  const at = new Set(ep.closureDates)
  const visits = rows.filter(
    (r) => r.permit_number === ep.key && at.has(day(r.inspection_date)) && normalizePlacard(r.facility_rating_status) === 'closure',
  )
  const fam = new Set<ViolationFamilyId>()
  const items: ViolationItem[] = []
  const notices: string[] = []
  const seenItem = new Set<string>()
  for (const r of visits) {
    for (const f of violationFamilies(r.violation_codes)) if (f !== 'closure-notice') fam.add(f)
    for (const it of parseViolationItems(r.violation_codes)) {
      if (seenItem.has(it.raw)) continue
      seenItem.add(it.raw)
      if (it.families.includes('closure-notice')) notices.push(it.raw)
      else items.push(it)
    }
  }
  const named = visits.find((r) => r.dba)?.dba
  return {
    permit: ep.key,
    era: 2024,
    episode: ep,
    name: displayBusinessName(named) || null,
    familyIds: VIOLATION_FAMILIES.map((f) => f.id).filter((id) => fam.has(id)),
    items,
    notices,
  }
}

const signature = (eps: readonly { key: string; start: string; clearedOn: string | null }[]): string =>
  eps
    .map((e) => `${e.key}|${e.start}|${e.clearedOn ?? ''}`)
    .sort()
    .join(',')

/** Every 2020+ closure episode at the door. With the live lane in hand, the
 *  2024+ ones are recomputed from it by THE episode rule (the panel wins);
 *  without it, the snapshot's stand. */
export function panelEpisodes(sf: Storefront, lane: readonly InspectionRow[] | null): PanelEpisodes {
  const snap2020 = sf.episodes.filter((e) => e.era === 2020).map((e) => snapshotEpisode(sf, e))
  const snap2024 = sf.episodes.filter((e) => e.era === 2024)
  let recent: PanelEpisode[]
  let live = false
  let updated = false
  if (lane) {
    const rows = dedupeLane(lane)
    const eps = closureEpisodes(
      rows.map((r) => ({ key: r.permit_number ?? '', date: day(r.inspection_date), status: r.facility_rating_status })),
    )
    recent = eps.map((ep) => liveEpisode(ep, rows))
    live = true
    updated = signature(eps) !== signature(snap2024.map((e) => ({ key: e.permit, start: e.start, clearedOn: e.clearedOn })))
  } else {
    recent = snap2024.map((e) => snapshotEpisode(sf, e))
  }
  const episodes = [...snap2020, ...recent].sort(
    (a, b) => cmp(b.episode.start, a.episode.start) || cmp(a.permit, b.permit),
  )
  return { episodes, live, updatedSinceAsOf: updated }
}

// ── the operators lede ─────────────────────────────────────────────────────

/** Inputs for restaurantPhrase.namesLede (voice sample 1), or null when the
 *  door has fewer than three names. `seenOnce` counts only the names that do
 *  NOT count toward the strict chain, so the sentence "…so we count N" never
 *  discounts an operator the rule counted (2704 24th St: five names, five
 *  counted — the second sentence drops). */
export function namesLedeInput(sf: Storefront): {
  address: string
  sinceYear: number
  names: string[]
  seenOnce: number
  counted: number
} | null {
  if (sf.operators.length < 3) return null
  const names = sf.operators.map((o) => displayBusinessName(o.name))
  const notCounted = sf.operators.filter((o) => !o.strict).length
  return {
    address: sf.address,
    sinceYear: Number(sf.operators[0].firstDate.slice(0, 4)),
    names,
    seenOnce: notCounted,
    counted: sf.operators.length - notCounted,
  }
}

// ── ownership + mailing address, from the snapshot ─────────────────────────

/** The owner of record for the current (most recently seen) operator, when
 *  resolved — currentOperator(), never the last-STARTED operator. */
export function currentOwner(sf: Storefront): StorefrontOwner | null {
  return currentOperator(sf)?.owner ?? null
}

/** Company owners registered at this storefront AND 3+ others' (the visible
 *  owner list, §3.8) — "Same owner elsewhere". */
export function ownersHere(snap: Pick<StorefrontSnapshot, 'owners'>, key: string): VisibleOwner[] {
  return snap.owners.filter((o) => o.storefronts.includes(key))
}

/** Published shared mailing addresses (every owner there a company — §11)
 *  that list this storefront. */
export function sharedAddressesHere(snap: Pick<StorefrontSnapshot, 'sharedAddresses'>, key: string): SharedMailingAddress[] {
  return snap.sharedAddresses.filter((a) => a.storefronts.includes(key))
}

/**
 * Does the panel say "Mailing address withheld" here, and why? 'shared' when a
 * shared address listing this door was withheld (a non-company is registered
 * there — the generator publishes the door keys only); 'person' when nothing
 * is published and the current owner is not a company (their own street and
 * ZIP are never stored); null when nothing was withheld.
 */
export function mailingWithheldHere(
  snap: Pick<StorefrontSnapshot, 'sharedAddresses' | 'withheldSharedStorefronts'>,
  sf: Storefront,
): 'shared' | 'person' | null {
  if ((snap.withheldSharedStorefronts ?? []).includes(sf.key)) return 'shared'
  const owner = currentOwner(sf)
  if (sharedAddressesHere(snap, sf.key).length === 0 && owner && owner.kind !== 'company') return 'person'
  return null
}

/** Curated "same restaurant group" claims that include this storefront. */
export function groupsHere(snap: Pick<StorefrontSnapshot, 'groups'>, key: string): SnapshotGroup[] {
  return snap.groups.filter((g) => g.storefronts.includes(key))
}

/** "Registry mailing address, group's own website" — the evidence kinds a
 *  curated group was checked against, for sameMailingNote(). */
export function evidenceKinds(g: Pick<CuratedGroup, 'evidence'>): string {
  const WORD: Record<string, string> = {
    'registry-mailing-address': 'the city business registry',
    'shared-trade-name': 'a shared trade name',
    'group-website': 'the group’s own website',
    'abc-licensee-address': 'the state liquor license record',
    'sos-agent-address': 'the Secretary of State filing',
  }
  return [...new Set(g.evidence.map((e) => WORD[e.kind] ?? e.kind))].join('; ')
}

/** A company's mailing address as one line: "25 Division St Ste 202, San
 *  Francisco 94103". Only ever called on a SharedMailingAddress, which the
 *  generator publishes only when every owner there is a company. */
export function mailingLine(a: Pick<SharedMailingAddress, 'address' | 'city' | 'zip'>): string {
  const tail = [a.city, a.zip].filter(Boolean).join(' ')
  return tail ? `${a.address}, ${tail}` : a.address
}

/** Display for a storefront key another list points at: the snapshot's
 *  address and latest name when it holds that door, else the key itself. */
export function storefrontLabel(index: ReadonlyMap<string, Storefront>, key: string): { address: string; name: string | null; known: boolean } {
  const sf = index.get(key)
  if (!sf) return { address: toTitleCase(key), name: null, known: false }
  const now = currentOperator(sf)
  return { address: sf.address, name: now ? displayBusinessName(now.name) : null, known: true }
}

/** Inputs for restaurantPhrase.ownerReturnedLede (voice sample 2), or null
 *  when no owner came back. Years come from the owner's registration when the
 *  registry dated it, else from the inspection records; `ownersBetween`
 *  counts distinct resolved owners between the two runs (an unresolved
 *  operator between them is not counted as an owner). */
export function ownerReturnedInput(sf: Storefront): {
  ownerKind: StorefrontOwner['kind']
  firstName: string
  address: string
  fromYear: number
  toYear: number
  returnYear: number
  returnName: string
  ownersBetween: number
} | null {
  const chips = ownerChips(sf.operators)
  const r = chips.indexOf('owner-returned')
  if (r < 0) return null
  const back = sf.operators[r]
  const key = ownerGroupKey(back.owner!.name)
  const firstIdx = sf.operators.findIndex((o) => o.owner && ownerGroupKey(o.owner.name) === key)
  // The end of the owner's first run: the last consecutive resolved operator
  // under that owner before someone else's owner appears.
  let lastIdx = firstIdx
  for (let i = firstIdx + 1; i < r; i++) {
    const k = sf.operators[i].owner ? ownerGroupKey(sf.operators[i].owner!.name) : ''
    if (!k) continue
    if (k !== key) break
    lastIdx = i
  }
  const first = sf.operators[firstIdx]
  const between = new Set<string>()
  for (let i = lastIdx + 1; i < r; i++) {
    const o = sf.operators[i].owner
    const k = o ? ownerGroupKey(o.name) : ''
    if (k && k !== key) between.add(k)
  }
  const yr = (s: string | null | undefined, fallback: string) => Number((s ?? fallback).slice(0, 4))
  return {
    ownerKind: back.owner!.kind,
    firstName: displayBusinessName(first.name),
    address: sf.address,
    fromYear: yr(first.owner!.registeredFrom, first.firstDate),
    toYear: yr(sf.operators[lastIdx].owner!.registeredTo, sf.operators[lastIdx].lastDate),
    returnYear: yr(back.owner!.registeredFrom, back.firstDate),
    returnName: displayBusinessName(back.name),
    ownersBetween: between.size,
  }
}
