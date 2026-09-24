// src/views/Restaurants/restaurantPhrase.ts
//
// Every reader-facing sentence the view writes — ledes, closure outcomes,
// window labels, the feed-break notice, and the data notes behind them. Pure;
// a build-failing test (restaurantPhrase.test.ts) bans the words that would
// turn a record into an accusation (spec §5, §7.1).
//
// The copy contract (spec §7.1): each sentence claims only what its record
// proves.
//   - A Closure row proves a suspension that day — a reinspection Closure is
//     the SAME closure, never a new one.
//   - An episode proves how many times a place was shut and the latest date it
//     was cleared — not the days it was actually closed. Hence "at most N days"
//     (no time of day; the next PUBLISHED pass).
//   - An episode with no later pass proves nothing about the outcome: "No later
//     inspection published". Never still-closed, never closed-for-good.
//   - A new name proves the sign changed, not the owner.
//   - A shared mailing address proves the registrations share an address, not
//     common ownership.
//
// Chrome stays clean; the precision lives in the DATA NOTES (Jesse,
// 2026-09-24, §11). An owner's mailing city renders as the plain city name —
// "Daly City" — with no label; what a mailing city means sits in
// MAILING_CITY_NOTE.
//
// Numbers follow AP: one through nine spelled out, 10 and up as figures, and a
// sentence never starts with a figure. Dates go through apDate (never Date).

import { apDate } from '@/utils/apDate'
import { FEED_BREAK, type FeedWindow, type FeedWindowId } from './inspectionFeed'
import type { ClosureEpisode } from './closureEpisodes'
import { PLACARD_WORD, type Placard } from './placard'

// ── numbers + dates ────────────────────────────────────────────────────────

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const START = [...SMALL, 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** AP count: one–nine spelled out, 10+ as figures with thousands commas. */
export function apCount(n: number): string {
  return n >= 0 && n < 10 && Number.isInteger(n) ? SMALL[n] : n.toLocaleString('en-US')
}

/** A count that opens a sentence: spelled out and capitalized (through 20). */
export function apCountStart(n: number): string {
  return n >= 0 && n <= 20 && Number.isInteger(n) ? cap(START[n]) : n.toLocaleString('en-US')
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/** Close a sentence without doubling an abbreviation's period ("St." stays "St."). */
const endSentence = (s: string): string => (s.endsWith('.') ? s : `${s}.`)

const MONTH_SHORT = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Sept. 2025" — the compact form the window pills use (spec §4.2 copy). */
export function monthYearShort(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

/** "January 2024" — month with a year alone, in running prose. */
export function monthYearLong(date: string): string {
  return `${MONTH_LONG[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

/** AP series: "a, b and c" (no serial comma). */
export function apList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ── windows + the feed break ───────────────────────────────────────────────

export const WINDOW_NAME: Readonly<Record<FeedWindowId, string>> = {
  since: 'Since the feed change',
  before: 'Full records',
}

/** "Sept. 2025–Aug. 2026". */
export function windowRange(w: Pick<FeedWindow, 'start' | 'end'>): string {
  return `${monthYearShort(w.start)}–${monthYearShort(w.end)}`
}

/** The window pill: "Since the feed change · Sept. 2025–Aug. 2026". */
export function windowLabel(w: FeedWindow): string {
  return `${WINDOW_NAME[w.id]} · ${windowRange(w)}`
}

/** The permanent badge on every card in the `since` window. */
export const THIN_FEED_BADGE = 'Thinner feed'

/** Voice sample 8 — the break notice. Stays "can't yet tell" until the manual
 *  DPH comparison (spec §9) settles what the thin feed drops. */
export const BREAK_NOTICE =
  'Since July 2025 the city has published about 70% fewer inspection records a month, ' +
  'and without saying what kind of visit each was. We can’t yet tell whether that means ' +
  'fewer inspections or fewer published, so this page never compares the two periods.'

/** Attached to an unresolved episode that began after the break. */
export const FEED_NOTE =
  'The city has published fewer inspection records since July 2025, so a later inspection may not appear here.'

// ── closure outcomes ───────────────────────────────────────────────────────

export const OUTCOME_SAME_DAY = 'Closed and cleared the same day'
export const OUTCOME_UNRESOLVED = 'No later inspection published'

/** "at most 17 days" / "at most one day". */
export function atMostDays(days: number): string {
  return `at most ${apCount(days)} ${plural(days, 'day', 'days')}`
}

/** One episode's outcome line:
 *    "Cleared Aug. 1 · at most 17 days"
 *    "Closed and cleared the same day"
 *    "No later inspection published" */
export function episodeOutcome(ep: ClosureEpisode, nowYear: number): string {
  if (ep.sameDay) return OUTCOME_SAME_DAY
  if (ep.clearedOn === null || ep.days === null) return OUTCOME_UNRESOLVED
  return `Cleared ${apDate(ep.clearedOn, nowYear)} · ${atMostDays(ep.days)}`
}

/** The feed note, when this episode needs it (unresolved AND after the break). */
export function episodeFeedNote(ep: ClosureEpisode): string | null {
  return ep.clearedOn === null && ep.start >= FEED_BREAK ? FEED_NOTE : null
}

/** Voice sample 4, rewritten to the banned-word list: the reinspections that
 *  found it closed are the same closure, never new ones.
 *    "Closed July 15, 2024. The next three inspections found it closed.
 *     Cleared Aug. 1, 2024 — at most 17 days." */
export function closureStory(ep: ClosureEpisode, nowYear: number): string {
  const opened = `Closed ${apDate(ep.start, nowYear)}.`
  if (ep.sameDay) return `${opened} Cleared the same day.`
  const more = ep.closureVisits - 1
  const kept = more > 0 ? ` The next ${more === 1 ? 'inspection' : `${apCount(more)} inspections`} found it closed.` : ''
  if (ep.clearedOn === null || ep.days === null) return `${opened}${kept} ${OUTCOME_UNRESOLVED}.`
  return `${opened}${kept} Cleared ${apDate(ep.clearedOn, nowYear)} — ${atMostDays(ep.days)}.`
}

/** A repeat-closure row's summary:
 *    "Three closures · each cleared within seven days"
 *    "Two closures · each cleared the same day"
 *    "Three closures · two cleared, one with no later inspection published" */
export function repeatSummary(episodes: readonly ClosureEpisode[]): string {
  const n = episodes.length
  const head = `${apCountStart(n)} ${plural(n, 'closure', 'closures')}`
  const unresolved = episodes.filter((e) => e.clearedOn === null).length
  if (unresolved === 0) {
    const longest = Math.max(0, ...episodes.map((e) => (e.sameDay ? 0 : (e.days ?? 0))))
    if (longest === 0) return `${head} · ${n === 1 ? 'cleared' : 'each cleared'} the same day`
    return `${head} · ${n === 1 ? 'cleared' : 'each cleared'} within ${apCount(longest)} ${plural(longest, 'day', 'days')}`
  }
  const cleared = n - unresolved
  return `${head} · ${apCount(cleared)} cleared, ${apCount(unresolved)} with no later inspection published`
}

// ── storefront header ──────────────────────────────────────────────────────

/** "Now: Golden Flower · latest inspection June 13, 2025: green placard". */
export function nowLine(name: string, latestDate: string, placard: Placard, nowYear: number): string {
  return `Now: ${name} · latest inspection ${apDate(latestDate, nowYear)}: ${PLACARD_WORD[placard]}`
}

/** 2016–19 score badge with SF's own bands: "92 · Good". The score belongs to
 *  that era only — never converted to or compared with a placard. */
export function scoreBadge(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'Not scored'
  const band = score >= 91 ? 'Good' : score >= 86 ? 'Adequate' : score >= 71 ? 'Needs Improvement' : 'Poor'
  return `${score} · ${band}`
}

// ── ledes ──────────────────────────────────────────────────────────────────

/** Turnover tab lede: the pinned count and the snapshot date. It names what
 *  was counted — business NAMES on the sign — because the count includes
 *  storefronts where one registered owner kept the door through every name
 *  (§7.1: a new name proves the sign changed, not the owner). */
export function turnoverLede(storefronts: number, asOf: string, nowYear: number): string {
  return (
    `At ${apCount(storefronts)} San Francisco ${plural(storefronts, 'storefront', 'storefronts')}, ` +
    `at least three different business names have hung over the door since 2016, going by city ` +
    `inspection records. Counted through ${apDate(asOf, nowYear)}.`
  )
}

/** Voice sample 1 — names seen vs operators counted:
 *  "Five names have hung over 2704 24th St. since 2016: Almanac, Seven Stills,
 *   Brewvino, Ayahuazka and Caprizza. Two of them turn up at a single
 *   inspection, so we count three operators." */
export function namesLede(p: { address: string; sinceYear: number; names: readonly string[]; seenOnce: number; counted: number }): string {
  const n = p.names.length
  const first = `${apCountStart(n)} ${plural(n, 'name has', 'names have')} hung over ${p.address} since ${p.sinceYear}: ${apList(p.names)}.`
  if (p.seenOnce <= 0) return first
  const once = p.seenOnce === 1 ? 'One of them turns up' : `${apCountStart(p.seenOnce)} of them turn up`
  return `${first} ${once} at a single inspection, so we count ${apCount(p.counted)} ${plural(p.counted, 'operator', 'operators')}.`
}

type OwnerKind = 'company' | 'individual' | 'unknown'
const ownerNoun = (k: OwnerKind): string => (k === 'company' ? 'company' : 'owner')

/** Voice sample 2 — an owner that left and came back. Never "same owner". */
export function ownerReturnedLede(p: {
  ownerKind: OwnerKind
  firstName: string
  address: string
  fromYear: number
  toYear: number
  returnYear: number
  returnName: string
  ownersBetween: number
}): string {
  const between =
    p.ownersBetween > 0
      ? ` ${apCountStart(p.ownersBetween)} other ${plural(p.ownersBetween, 'owner', 'owners')} came and went in between.`
      : ''
  return (
    `The ${ownerNoun(p.ownerKind)} that ran ${p.firstName} at ${p.address} from ${p.fromYear} to ${p.toYear} ` +
    `came back in ${p.returnYear} as ${p.returnName}.${between}`
  )
}

/** Voice sample 3 — new names, one registered owner:
 *  "Five names since 2017 at 570 Green St. The city's business registry lists
 *   one company, Pete's on Green LLC, behind the first three." */
export function sameOwnerLede(p: { address: string; sinceYear: number; names: number; owner: string; ownerKind: OwnerKind; behindFirst: number }): string {
  const behind = p.behindFirst >= p.names ? 'behind all of them' : `behind the first ${apCount(p.behindFirst)}`
  return (
    `${apCountStart(p.names)} ${plural(p.names, 'name', 'names')} since ${p.sinceYear} at ${endSentence(p.address)} ` +
    `The city’s business registry lists one ${ownerNoun(p.ownerKind)}, ${p.owner}, ${behind}.`
  )
}

/** Voice sample 5. "Most closures are short." only when it is true of the
 *  figures given (at least half cleared within a day, same-day included). */
export function closuresLede(p: { cleared: number; clearedWithinADay: number; since: string }): string {
  const most = p.cleared > 0 && p.clearedWithinADay * 2 >= p.cleared ? 'Most closures are short. ' : ''
  return (
    `${most}Of the ${apCount(p.cleared)} ${plural(p.cleared, 'closure', 'closures')} since ${monthYearLong(p.since)} ` +
    `that ended in a passing inspection, ${apCount(p.clearedWithinADay)} ${plural(p.clearedWithinADay, 'was', 'were')} cleared within a day.`
  )
}

/** Voice sample 6 — cause, with its scope stated. `n`/`m` come from ONE scope
 *  (FOOD_WHERE, generator-pinned); never mix scopes in this sentence. */
export function verminSentence(p: { cited: number; closureInspections: number; since: string }): string {
  return (
    `Signs of vermin were cited at ${apCount(p.cited)} of the ${apCount(p.closureInspections)} closure ` +
    `inspections at food businesses since ${monthYearLong(p.since)}.`
  )
}

/** Voice sample 7 — ownership size, with its confounder attached (never dropped). */
export function ownerSizeSentence(p: {
  singleClosed: number
  singleInspections: number
  bigThreshold: number
  bigClosed: number
  bigInspections: number
}): string {
  const pct = p.singleInspections > 0 ? ((p.singleClosed / p.singleInspections) * 100).toFixed(1) : '0.0'
  const big = p.bigClosed === 0 ? `none of ${apCount(p.bigInspections)}` : `${apCount(p.bigClosed)} of ${apCount(p.bigInspections)}`
  return (
    `Restaurants whose owner has a single location were closed at ${apCount(p.singleClosed)} of ` +
    `${apCount(p.singleInspections)} routine inspections, or ${pct}%. Owners with ${apCount(p.bigThreshold)} ` +
    `or more locations: ${big}. Most of those are office cafeterias and coffee chains, which do simpler ` +
    `cooking, so this doesn’t show that bigger owners run cleaner kitchens.`
  )
}

// ── owners: names, mailing city, shared addresses ──────────────────────────

/** An owner's mailing city, exactly as a reader should see it: the plain city
 *  name ("Daly City") — no "mailing city" label, no state, no "lives in".
 *  The registry already title-cases (measured 2026-09-24); whitespace is
 *  collapsed ('San  Francisco' appears once) and an all-caps or all-lower
 *  value is title-cased. null/empty → null (render nothing). The generator
 *  writes null for the city's undeliverable-placeholder rows, which carry
 *  San Francisco as their city — so a placeholder never reads "San Francisco". */
export function mailingCityLabel(city: string | null | undefined): string | null {
  const s = (city ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.toLowerCase().replace(/(^|[\s\-'’.])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  }
  return s
}

/** The shared-address FACT (published automatically after filters F1–F5).
 *  Never worded as common ownership — that CLAIM needs a curated group. */
export function sharedMailingSentence(companies: number): string {
  return `These ${apCount(companies)} companies list the same mailing address on their city registrations.`
}

/** Chrome label where a shared mailing address is withheld; the reason lives
 *  in MAILING_WITHHELD_NOTE. */
export const MAILING_WITHHELD_LABEL = 'Mailing address withheld'

// ── labels ─────────────────────────────────────────────────────────────────

export const TOO_FEW_TO_RATE = 'too few inspected to rate'
export const TURNOVER_LEGEND = 'Rings count names on inspection records, not owners.'
export const SEEN_ONCE = 'seen once'
export const SAME_OWNER_CHIP = 'same owner as before'
export const OWNER_RETURNED_CHIP = 'owner came back'

// ── data notes (the precision behind every simplified label) ───────────────

export const CARD_NOTE =
  'Counts are places, not inspections. A place closed several times in the window counts once. ' +
  'Food trucks, carts and home kitchens are counted here but never mapped.'

export const DURATION_NOTE =
  '“At most N days” runs to the next published passing inspection. Inspections have no time of day, ' +
  'so a closure and a pass on the same date is shown as cleared the same day.'

export const NEIGHBORHOOD_RATES_NOTE =
  'Places closed ÷ places inspected in the chosen window. Never compared across the July 2025 change.'

/** Turnover tab note (DataDiver-authored, disclosed like the Oakland beat names). */
export function turnoverNote(asOf: string, excludedAddresses: number, nowYear: number): string {
  return (
    `Built by DataDiver from three city inspection datasets and the city business registry, last rebuilt ` +
    `${apDate(asOf, nowYear)}. Food halls, stadiums, shared kitchens and malls are left out ` +
    `(${apCount(excludedAddresses)} ${plural(excludedAddresses, 'address', 'addresses')}). A business that ` +
    `opened and closed inside a publishing gap is missing, so every count here is a minimum.`
  )
}

/** Owners tab note — §11 supersedes §7.3: owner names are shown for every
 *  owner, persons included, exactly as the registry publishes them. */
export function ownersNote(matchPct: number): string {
  return (
    `Owners as registered with the city Treasurer, matched to inspections by address and name — there is ` +
    `no shared ID number; ${Math.round(matchPct)}% of inspected places match. Names appear as the registry ` +
    `publishes them. Many owners set up one company per location for ordinary legal reasons.`
  )
}

/** What the plain city beside an owner means (Jesse, 2026-09-24: put just the
 *  city on the page; the specifics always go in the data notes). */
export const MAILING_CITY_NOTE =
  'The city beside each owner is the mailing city on that owner’s city business registration — where the ' +
  'Treasurer sends bills and letters. It is not necessarily where anyone lives or where the business is run: ' +
  'large food-service companies list a head office (Aramark in Philadelphia; Compass Group and Levy in ' +
  'Charlotte, N.C.; Sodexo in Cheektowaga, N.Y.; Starbucks in Seattle). Registrations the city marks ' +
  'undeliverable carry San Francisco as a placeholder, so no city is shown for them. Registrations that have ' +
  'ended mostly carry no mailing city at all, so a past owner often shows none.'

/** Withheld fields, why, and where to find them. */
export const MAILING_WITHHELD_NOTE =
  'For people registered in their own name, DataDiver shows the name and mailing city but not the street ' +
  'address or ZIP code, which may be a home; DataDiver does not store them. A company’s mailing address is ' +
  'shown only when every owner registered at that address is a company. All of these fields appear on the ' +
  'business registry record at data.sf.gov.'

/** Behind the panel's "Mailing address withheld" line when the owner here is
 *  a company whose SHARED address was withheld — the reason at the place a
 *  reader looks (§11: a redaction is never silent). */
export const SHARED_WITHHELD_NOTE =
  'This storefront’s owner shares a mailing address with other food businesses, but at least one owner ' +
  'registered at that address is not a company — possibly a person, whose address may be a home — so ' +
  'DataDiver withholds the address and the list of businesses there. The registry record at data.sf.gov ' +
  'still shows it.'

/** Same-mailing-address note; `evidence` names the sources checked, for
 *  curated groups ("the group’s own website"). */
export function sameMailingNote(evidence?: string): string {
  const checked = evidence ? ` Each group was checked by hand against at least one other public source (${evidence}).` : ''
  return (
    `These companies list the same mailing address on their city business registrations.${checked} ` +
    `A shared address alone does not show common ownership: accountants, registered agents and kitchen ` +
    `incubators share addresses too.`
  )
}

/** Inspectors: shown, never ranked — and the notes say why. */
export const INSPECTOR_NOTE =
  'Each inspection names the city inspector who conducted it, as the city publishes it. DataDiver does not ' +
  'rank, filter or search by inspector: closure rates differ between inspectors mostly because they cover ' +
  'different neighborhoods.'
