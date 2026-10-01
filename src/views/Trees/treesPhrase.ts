// src/views/Trees/treesPhrase.ts
//
// The Trees view's writing layer: every reader-facing sentence the view
// generates, pure and tested. Word rules (plan, Global Constraints): "street
// trees", "trunk size as recorded" (never an age), "removal notice" (a posted
// notice, never a removal), "fall reports nearby" (a report names an address,
// never a tree), "left the inventory". No statistics words reach a reader —
// treesPhrase.test.ts fails the build if one does.

import type { EquityFlag, LinkStrength, RobustLink } from '@/lib/trees/equity'
import { MIN_POPULATION, PARK_HEAVY } from '@/lib/trees/equity'
import { NEARBY_METERS, PLACEABLE_FLOOR } from '@/lib/trees/fallReports'
import type { NoticeReading, NoticedByKind } from '@/lib/trees/siteNotices'
import type { RowKind } from '@/lib/trees/species'
import { TRUNK_LABEL } from '@/lib/trees/trunk'
import type { DisappearedLog, FallYear } from '@/lib/trees/types'
import { apDate } from '@/utils/apDate'

/** Figures with thousands commas. Local on purpose: Restaurants' apCount
 *  spells out one–nine, and views do not import each other's phrase layers. */
export function apCount(n: number): string {
  return n.toLocaleString('en-US')
}

export const SUBHEAD = 'Every street tree the city keeps on record'
export const PARKS_LINE = 'Street trees only. Trees inside parks and the Presidio are not in this inventory.'
export const TRUNK_NOTE = 'Trunk size as the city last recorded it. The record does not say when.'
/** The card's trunk note for a stump, an empty site or a shrub: the row still
 *  carries a trunk size, and the record does not say which tree it measured. */
export const TRUNK_NOTE_NOT_TREE = 'The city’s record still carries a trunk size for this site. It does not say which tree was measured, or when.'
export const STUMP_LEGEND = 'A stump stands here'
export const FALLS_LEGEND = '311 reports of a fallen tree'
export const UNKNOWN_SITE = 'No street tree site has this number.'
export const UNDATED_NOTICE = 'A removal notice with no posted date is on record for this site.'
export const CARD_ERROR = 'The city’s tree record did not load.'

/** `of` counts published species NAMES (cultivars and spellings apart), so
 *  the line says names, never a count of species. */
export function speciesRankLine(rank: number, of: number): string {
  return `No. ${rank} of ${apCount(of)} species names`
}

/** The unit is published NAMES (cultivars and spellings apart), so the line
 *  says names, never species. */
export function topFiveLine(share: number): string {
  return `The five most common species names are ${share}% of street trees.`
}

// ── Explore tab ──────────────────────────────────────────────────────────────
// Chip captions (≤ 4 words), the sentences behind the marks (aria-labels and
// InfoTips), and the species card's lines.

export const CAPTION_STREET_TREES = 'Street trees'
export const CAPTION_SPECIES = 'Species names'
export const CAPTION_TOP_FIVE = 'Top five names'
export const CAPTION_SHARE = 'Of street trees'
export const TRUNK_HEADING = 'Trunk size as recorded'
export const TOP_NEIGHBORHOODS_HEADING = 'Neighborhoods with the most of this species'
// The example address must match an inventory site (1300 Bush St held three
// on Sept. 30, 2026). A live address cannot be unit-pinned: re-probe it at
// every regeneration (CLAUDE.md Trees bullet, data-insights → Street trees).
export const SEARCH_PLACEHOLDER = 'Species, or an address like 1300 Bush'
export const SEARCH_LABEL = 'Search species or a street address'
export const ADDRESS_SEARCHING = 'Searching addresses…'
export const ADDRESS_ERROR = 'The address search did not load.'
export const NO_PLANTING_DATES = 'No planting dates recorded'
export const SHOW_FEWER = 'Show fewer'
export const RAIL_ERROR = 'The street-tree summaries did not load.'
/** Under the Equity lens, when the neighborhood shapes the fill needs fail to load. */
export const BOUNDARIES_ERROR = 'The neighborhood map shapes did not load, so the Equity colors cannot be drawn.'

export function streetTreesTip(n: number): string {
  return `The city’s inventory lists ${apCount(n)} street trees. ${PARKS_LINE}`
}

export function speciesCountTip(n: number): string {
  return `The inventory uses ${apCount(n)} different species names, each as the city publishes it. ` +
    'Cultivars and spelling variants count as separate names.'
}

/** A ranking row's sentence, for its aria-label. */
export function speciesRowLabel(rank: number, label: string, count: number): string {
  return `No. ${rank}, ${label}: ${apCount(count)} street tree${count === 1 ? '' : 's'}`
}

/** The species card's share figure, for its aria-label; `pct` from
 *  exploreRows.sharePercent. */
export function shareLine(pct: string): string {
  return `${pct} of street trees`
}

export function trunkMixLabel(classLabel: string, n: number, of: number): string {
  return `${TRUNK_HEADING}, ${classLabel}: ${apCount(n)} of ${apCount(of)} street trees`
}

/** "Planted 1998–2024 where recorded (1,007 of 8,943)". */
export function speciesPlantedLine(years: [number, number] | null, recorded: number, count: number): string {
  if (!years || recorded <= 0) return NO_PLANTING_DATES
  const span = years[0] === years[1] ? `${years[0]}` : `${years[0]}–${years[1]}`
  return `Planted ${span} where recorded (${apCount(recorded)} of ${apCount(count)})`
}

export function neighborhoodCountLabel(name: string, n: number): string {
  return `${name}: ${apCount(n)} street tree${n === 1 ? '' : 's'} of this species`
}

export function showAllLine(n: number): string {
  return `Show all ${apCount(n)} species names`
}

/** The eyebrow over a selected species pinned above a search it does not match. */
export const PINNED_SELECTION = 'Current selection'

export function noSpeciesMatchLine(query: string): string {
  return `No species name matches “${query.trim()}”.`
}

export function noAddressLine(query: string): string {
  // The search reads every inventory site — stumps and empty sites too.
  return `No inventory site address starts with “${query.trim()}”.`
}


// ── Equity lead ──────────────────────────────────────────────────────────────
// Income pair only. A measure "holds" when its ROBUST link is at least weak —
// the tier that survives leaving out any one neighborhood (ruling R18,
// `robustLink` in src/lib/trees/equity.ts); its direction is the full set's
// sign. The sentence states only what both measures support.

const MEASURE = { perK: 'per resident', perKm2: 'per square kilometer' } as const
type Measure = keyof typeof MEASURE

const incomeSide = (positive: boolean): string => (positive ? 'higher-income' : 'lower-income')
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "have more" for a strong link, "tend to have more" for a weak one (ruling R8). */
const haveMore = (strength: LinkStrength): string => (strength === 'strong' ? 'have more' : 'tend to have more')

/** Each measure's robust tier and the full set's link (its sign is the direction). */
export type LeadLinks = Record<Measure, Pick<RobustLink, 'rho' | 'strength'>>

export function equityLead(links: LeadLinks): string {
  const a: LinkStrength = links.perK.strength
  const b: LinkStrength = links.perKm2.strength
  const aHolds = a !== 'none', bHolds = b !== 'none'

  if (aHolds && bHolds) {
    const aPos = links.perK.rho > 0, bPos = links.perKm2.rho > 0
    if (aPos !== bPos) {
      // Each side names its own strength, so a weak side never stands level with a strong one.
      return `The two measures disagree. Counted ${MEASURE.perK}, ${incomeSide(aPos)} neighborhoods have more street trees, ` +
        `and the link is ${a}. Counted ${MEASURE.perKm2}, ${incomeSide(bPos)} neighborhoods have more, and the link is ${b}.`
    }
    const side = cap(incomeSide(aPos))
    if (a === b) return `${side} neighborhoods ${haveMore(a)} street trees, whether trees are counted ${MEASURE.perK} or ${MEASURE.perKm2}.`
    // Mixed strengths: the first sentence takes the WEAKER side's wording
    // (ruling R10), so a quote of it alone never overclaims; the second names
    // each measure's own strength.
    return `${side} neighborhoods tend to have more street trees. The link is ${a} when trees are counted ${MEASURE.perK} and ${b} when counted ${MEASURE.perKm2}.`
  }

  if (aHolds !== bHolds) {
    const holds: Measure = aHolds ? 'perK' : 'perKm2'
    const other: Measure = aHolds ? 'perKm2' : 'perK'
    const positive = links[holds].rho > 0
    return `Counted ${MEASURE[holds]}, ${incomeSide(positive)} neighborhoods ${haveMore(aHolds ? a : b)} street trees. ` +
      `Counted ${MEASURE[other]}, there is no clear pattern. The answer depends on the measure.`
  }

  return 'Street trees show no clear pattern by neighborhood income under either measure.'
}

/** `name` is the neighborhood: a park-heavy note carries its own measured
 *  open-space share (PARK_HEAVY, ruling R20). No note says a neighborhood has
 *  few trees overall — park trees are not in this inventory. */
export function equityFlagNote(flag: EquityFlag, name: string): string | null {
  switch (flag) {
    case 'park': return 'Mostly parkland. Park trees are not in this inventory.'
    case 'low-coverage': return 'The inventory lists almost no trees here.'
    case 'park-heavy': {
      const tail = 'Its residential streets are counted citywide but not ranked here.'
      const share = Object.prototype.hasOwnProperty.call(PARK_HEAVY, name) ? PARK_HEAVY[name] : null
      return share === null
        ? `Large parks take up much of its land, and park trees are not in this inventory. ${tail}`
        : `About ${Math.round(share)}% of its land is open space, so few of its streets carry street trees. ${tail}`
    }
    case 'small-population': return `Fewer than ${apCount(MIN_POPULATION)} residents, so the per-resident figure swings widely.`
    default: return null
  }
}

// ── Equity tab ───────────────────────────────────────────────────────────────
// The measure pills, the two median chips, and each row's small lines. Rows
// rank by one measure and print the other measure's rank beside it, so the
// flip between the two is visible without switching.

/** The measure pills (`?rank=`). */
export const EQUITY_MEASURE = { perK: 'Per 1,000 residents', perKm2: 'Per square kilometer' } as const
/** The median chips' captions (≤ 4 words). */
export const MEDIAN_CAPTION = { perK: 'Median per 1,000 residents', perKm2: 'Median per square kilometer' } as const
export const RANK_BY_LABEL = 'Rank neighborhoods by'
export const NO_CENSUS = 'No census figure'
export const INCOME_KEY = 'Median household income'
export const INCOME_KEY_TIP = 'Each dot is a neighborhood’s median household income, placed on the range across neighborhoods without a flag. ' +
  'The tick marks the middle neighborhood.'
export const FLAGGED_LEGEND = 'Flagged, not ranked'
/** The map legend's heading under the Equity lens, per measure. */
export const EQUITY_LEGEND_HEAD = { perK: 'Street trees per 1,000 residents', perKm2: 'Street trees per square kilometer' } as const

const UNIT = { perK: 'per 1,000 residents', perKm2: 'per square kilometer' } as const

/** A per-resident or per-area figure: whole numbers with commas; one decimal
 *  under ten, so 2.5 never reads as 3. */
export function equityFigure(v: number): string {
  return Math.abs(v) < 10 ? v.toFixed(1) : apCount(Math.round(v))
}

/** "$106K" — a mark's short label; a null income never reaches here
 *  (the caller prints NO_CENSUS). */
export function incomeShort(n: number): string {
  return `$${apCount(Math.round(n / 1000))}K`
}

/** "No. 33 by area" / "No. 6 per resident" — the OTHER measure's rank. */
export function otherRankLine(position: number, other: 'perK' | 'perKm2'): string {
  return `No. ${position} ${other === 'perKm2' ? 'by area' : 'per resident'}`
}

/** A median chip's sentence (its InfoTip and aria-label). With an even count
 *  the figure is the mean of the middle two, and the sentence says so. */
export function medianTip(by: 'perK' | 'perKm2', value: number, n: number): string {
  const middle = n % 2 === 0 ? 'the middle two average' : 'the middle one has'
  return `Among the ${apCount(n)} neighborhoods without a flag, ${middle} ${equityFigure(value)} street trees ${UNIT[by]}.`
}

/** A list row's sentence, for its aria-label: the marks it replaces are the
 *  position, the figure, the other rank and the income dot. */
export function equityRowLabel(
  r: { name: string; value: number; position: number | null; otherPosition: number | null; medianIncome: number | null; flag: EquityFlag },
  by: 'perK' | 'perKm2',
): string {
  const figure = `${r.name}: ${equityFigure(r.value)} street trees ${UNIT[by]}.`
  const head = r.position !== null ? `No. ${r.position}, ${figure}` : figure
  const other = r.otherPosition !== null ? ` ${otherRankLine(r.otherPosition, by === 'perK' ? 'perKm2' : 'perK')}.` : ''
  const note = r.flag !== null ? ` Not ranked: ${equityFlagNote(r.flag, r.name)}` : ''
  const income = r.medianIncome !== null ? ` ${INCOME_KEY} ${incomeShort(r.medianIncome)}.` : ` ${NO_CENSUS}.`
  return `${head}${other}${note}${income}`
}

// ── Tree card lines ──────────────────────────────────────────────────────────

const NOTICE_TYPE: Readonly<Record<string, string>> = {
  'Posted 24hr': '24-hour',
  'Posted 15 Day': '15-day',
  'Posted 30 Day': '30-day',
}

export function noticeLine(reading: NoticeReading, postedYmd: string, type: string, nowYear: number): string {
  const kind = NOTICE_TYPE[type]
  const notice = kind ? `A removal notice (${kind})` : 'A removal notice'
  const where = reading === 'earlier-tree' ? 'for an earlier tree at this site' : 'at this site'
  return `${notice} was posted ${where} on ${apDate(postedYmd, nowYear)}.`
}

export const NOT_RECORDED = 'Not recorded'
export const NO_ADDRESS = 'Address not recorded'

/** A non-tree row's card title; a tree is titled by its species. */
export function kindTitle(kind: Exclude<RowKind, 'tree'>): string {
  return kind === 'stump' ? 'Stump' : kind === 'site' ? 'Empty planting site' : 'Shrub'
}

/** `plantedYmd` 'YYYY-MM-DD' (or a floating SF-local datetime), or null. */
export function plantedLine(plantedYmd: string | null, nowYear: number): string {
  return plantedYmd ? `Planted ${apDate(plantedYmd.slice(0, 10), nowYear)}` : 'Planting date not recorded'
}

/** "3 inches (10 inches or narrower)" — trunk size as recorded, in the
 *  class's own words; `classLabel` is TRUNK_LABEL for the class. */
export function trunkLine(inches: number | null, classLabel: string): string {
  if (inches === null) return classLabel
  return `${inches} inch${inches === 1 ? '' : 'es'} (${classLabel})`
}

/** "mapped" in both branches (ruling R19): the count sees only reports with a
 *  map point, so a zero is no report WITH A POINT nearby, never no report. */
export function nearbyFallsLine(n: number, sinceYear: number): string {
  const near = `within ${NEARBY_METERS} meters since ${sinceYear}.`
  if (n === 0) return `No mapped fall reports ${near}`
  return `${apCount(n)} mapped fall report${n === 1 ? '' : 's'} ${near}`
}

/** A site the live inventory no longer lists. The record does not say why —
 *  a tree coming down, record clean-up, renumbering — so nothing is claimed. */
export function leftInventoryNote(asOf: string, nowYear: number): string {
  return `This site is no longer listed in the city’s inventory. It was there on ${apDate(asOf, nowYear)}; the record does not say why.`
}

export function disappearedLine(log: DisappearedLog, nowYear: number): string {
  const latest = log.runs[log.runs.length - 1]
  if (!latest) return `DataDiver began recording which sites leave the inventory on ${apDate(log.trackingSince, nowYear)}.`
  const n = latest.gone.length
  return `${apCount(n)} site${n === 1 ? '' : 's'} left the inventory between ${apDate(latest.from, nowYear)} and ${apDate(latest.to, nowYear)}.`
}

// ── Safety tab ───────────────────────────────────────────────────────────────
// A dispassionate ledger, not an alarm: every figure names what it counts,
// nothing scores a tree, and the two kinds of fall report (a fall that
// happened vs a worry) are never summed. The busiest day is citywide only.

export const CAPTION_LARGE_TRUNKS = 'Trunks 21+ inches wide'
export const CAPTION_STUMPS = 'Stumps on record'
export const FALLS_BY_YEAR_HEAD = 'Fall reports by year'
export const FALLEN_KEY = 'Fallen tree'
export const ABOUT_KEY = 'About to fall'
export const SO_FAR = 'so far'
export const CITYWIDE_ONLY = 'citywide only'
export const NEIGHBORHOOD_FALLS_HEAD = 'Fallen-tree reports by neighborhood'
export const NEIGHBORHOOD_YEARS_LABEL = 'Year of fall reports'
/** The list head over each row's two figures, top to bottom: the year's
 *  mapped fallen-tree reports, and the neighborhood's street trees as a plain
 *  figure beside it — never divided into a rate (ruling R17). */
export const ROWS_COUNT_HEAD = 'Reports'
export const ROWS_TREES_HEAD = 'Street trees'
export const STREET_TREES_UNIT = 'street trees'
/** Under the year pills: rows count only mapped reports (S3). */
export const ROWS_MAPPED_ONLY = 'Rows count only reports with a map point, so a year’s rows can add up to less than its bar above.'
export const LARGE_TRUNKS_UNIT = 'trunks 21+ in.'
export const STUMPS_UNIT = 'stumps'
export const NO_FALL_YEARS = 'No full year has enough mapped reports to count by neighborhood.'
export const NOTICES_HEAD = 'Removal notices'
export const NOTICES_LISTED_CAPTION = 'sites with a notice still in the inventory'
export const FORMER_HEAD = 'Sites that left the inventory'
export const DISAPPEARED_ERROR = 'The log of sites that left the inventory did not load.'
/** The map legend's line under the Safety lens. */
export const FALLS_NOT_DRAWN = 'Fall reports are not drawn: a report marks an address, not a tree.'
/** The legend below the dot zoom, where the map shows density only. */
export const ZOOM_IN_LINE = 'Zoom in to see each tree'
/** The same, when a picked species is already drawn at every zoom. */
export const ZOOM_IN_OTHERS = 'Zoom in to see the other trees'
export const HEAT_FEWER = 'Fewer'
export const HEAT_MORE = 'More street trees'

const plural = (n: number, one: string, many: string): string => `${apCount(n)} ${n === 1 ? one : many}`

/** "2022", "2022 and 2023", "2021, 2022 and 2023" (AP: no serial comma). */
function listAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The legend row for trees whose trunk was never measured. */
export function unmeasuredLegendLine(n: number): string {
  return `No trunk measurement (${apCount(n)}): drawn at the smallest size`
}

export function largeTrunksLine(n: number): string {
  return `${plural(n, 'street tree has', 'street trees have')} a recorded trunk ${TRUNK_LABEL.large}.`
}

export function stumpsLine(n: number): string {
  return `The inventory lists ${plural(n, 'stump', 'stumps')} at street tree sites.`
}

export function fallChipCaption(year: number): string {
  return `Fallen-tree reports, ${year}`
}

export function fallChipTip(year: number, fallen: number, aboutToFall: number): string {
  return `In ${year}, 311 logged ${plural(fallen, 'report', 'reports')} of a fallen tree and ${apCount(aboutToFall)} of a tree ` +
    'about to fall, not counting reports the city closed as duplicates.'
}

/** One bar of the year strip, for its aria-label. */
export function fallBarLabel(b: { year: number; fallen: number; aboutToFall: number; partial: boolean; placeable: boolean }): string {
  const head = b.partial ? `${b.year} ${SO_FAR}` : `${b.year}`
  const counts = `${plural(b.fallen, 'fallen-tree report', 'fallen-tree reports')}, ` +
    `${plural(b.aboutToFall, 'about-to-fall report', 'about-to-fall reports')}.`
  const where = b.placeable ? '' : ' Citywide only: too few of these reports carry a map point to count by neighborhood.'
  return `${head}: ${counts}${where}`
}

/** The small captions under one bar of the year strip: "so far" for the
 *  partial year, "citywide only" for an unplaceable one — BOTH when a year is
 *  both (R1). */
export function fallBarCaptions(b: { partial: boolean; placeable: boolean }): string[] {
  const out: string[] = []
  if (b.partial) out.push(SO_FAR)
  if (!b.placeable) out.push(CITYWIDE_ONLY)
  return out
}

/** The line under the neighborhood pills: which years they leave out and
 *  why, read from the data (R1). null when none is left out. A year that is
 *  both partial and unplaceable is named once, for the map point. */
export function yearsLeftOutLine(years: readonly FallYear[]): string | null {
  const sorted = [...years].sort((a, b) => a.year - b.year)
  const unplaced = sorted.filter((y) => !y.placeable).map((y) => String(y.year))
  const partial = sorted.filter((y) => y.placeable && y.partial).map((y) => String(y.year))
  const parts: string[] = []
  if (unplaced.length) parts.push(`${listAnd(unplaced)}, when fewer than ${PLACEABLE_FLOOR}% of reports carry a map point`)
  if (partial.length) parts.push(`${listAnd(partial)}, which ${partial.length === 1 ? 'is' : 'are'} not over`)
  if (parts.length === 0) return null
  return `Neighborhood counts leave out ${parts.join(', and ')}.`
}

/** Citywide only — the busiest day is never split by neighborhood. */
export function busiestDayLine(day: { ymd: string; reports: number }, nowYear: number): string {
  return `The busiest single day was ${apDate(day.ymd, nowYear)}, with ${plural(day.reports, 'fall report', 'fall reports')} citywide, ` +
    'counting fallen-tree and about-to-fall reports together.'
}

/** A neighborhood row's sentence, for its aria-label. The street trees stand
 *  beside the reports as their own figure, never divided (ruling R17). */
export function safetyRowLabel(
  r: { name: string; fallen: number; aboutToFall: number; trees: number; largeTrunks: number; stumps: number },
  year: number,
): string {
  return `${r.name}: ${plural(r.fallen, 'fallen-tree report', 'fallen-tree reports')} and ` +
    `${plural(r.aboutToFall, 'about-to-fall report', 'about-to-fall reports')} in ${year}. ` +
    `${plural(r.trees, 'street tree', 'street trees')} in the inventory today, ` +
    `${apCount(r.largeTrunks)} with a recorded trunk ${TRUNK_LABEL.large}; ` +
    `${plural(r.stumps, 'stump', 'stumps')}.`
}

export function noticesListedLabel(listed: number, sites: number): string {
  return `${apCount(listed)} of ${apCount(sites)} sites with a removal notice are still in the inventory.`
}

/** The notice type under its PUBLISHED name — the page does not interpret it. */
export function noticeTypeLabel(type: string, n: number): string {
  return `${type}: ${plural(n, 'removal notice', 'removal notices')}`
}

/** Notices beside sites: a site can hold more than one notice, so the two
 *  totals differ and the line says why; notices with no readable site number
 *  are named, so the sites never claim every notice. */
export function noticesTotalLine(rows: number, sinceYear: number | null, sites: number, unjoinable: number): string {
  const head = `${plural(rows, 'removal notice', 'removal notices')} posted`
  const since = sinceYear === null ? head : `${head} since ${sinceYear}`
  const loose = unjoinable > 0 ? `; ${apCount(unjoinable)} carr${unjoinable === 1 ? 'ies' : 'y'} no readable site number` : ''
  return `${since} at ${plural(sites, 'site', 'sites')}${loose}. A site can hold more than one notice.`
}

const NOTICED_AS: readonly (readonly [keyof NoticedByKind, string])[] = [
  ['tree', 'a street tree'], ['stump', 'a stump'], ['site', 'an empty planting site'], ['shrub', 'a shrub'],
]

/** "4,368 listed as a street tree, 136 as a stump, 325 as an empty planting
 *  site and 2 as a shrub" — what the noticed sites still in the inventory are
 *  listed as now (final review I2). Kinds with none are left out; null when
 *  every count is zero. Shared by the Safety tab's line and the data note. */
export function noticedKindsList(k: NoticedByKind): string | null {
  const parts = NOTICED_AS.filter(([key]) => k[key] > 0)
    .map(([key, as], i) => `${apCount(k[key])} ${i === 0 ? 'listed ' : ''}as ${as}`)
  return parts.length ? listAnd(parts) : null
}

/** The line under the "still in the inventory" bar. */
export function noticedKindsLine(k: NoticedByKind): string | null {
  const list = noticedKindsList(k)
  if (list === null) return null
  const first = NOTICED_AS.find(([key]) => k[key] > 0) as readonly [keyof NoticedByKind, string]
  const verb = k[first[0]] === 1 ? 'is' : 'are'
  return `Of those, ${list.replace(/^(\S+) listed /, `$1 ${verb} listed `)}.`
}

/** `replantedAfter` counts every listed site whose planting date on record is
 *  later than its latest notice, whatever the site holds now — so the line
 *  speaks of the date, never of "the tree listed now". */
export function replantedAfterLine(n: number): string {
  return `At ${plural(n, 'site', 'sites')}, the planting date now on record is later than the site’s removal notice, ` +
    'so that notice belongs to an earlier tree.'
}
