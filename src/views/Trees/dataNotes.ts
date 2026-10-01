// src/views/Trees/dataNotes.ts
//
// The ONE table of the Trees view's data notes — the precision behind every
// simplified label (chrome stays clean, the notes carry the detail). The
// header popover renders it once, grouped by surface; each rail tab and the
// tree card link to their section instead of printing their own copy (the
// Restaurants lesson). Every figure is read from aggregates.json (and the one
// notices breakdown from the big snapshot, passed in once it has loaded);
// with no file each note falls back to a wording that claims no figure.

import { MIN_POPULATION, PARK_HEAVY, linkStrength } from '@/lib/trees/equity'
import { NEARBY_METERS } from '@/lib/trees/fallReports'
import type { NoticedByKind } from '@/lib/trees/siteNotices'
import { TRUNK_LABEL } from '@/lib/trees/trunk'
import type { FallYear, TreesAggregates } from '@/lib/trees/types'
import { apDate } from '@/utils/apDate'
import { leadLinks, unflaggedCount } from './equityView'
import { PARKS_LINE, apCount, noticedKindsList } from './treesPhrase'

export type NoteSectionId = 'general' | 'explore' | 'equity' | 'safety' | 'tree'

export interface DataNote {
  title: string
  body: string
  /** An outbound link rendered after the body ("Open the city’s tree inventory"). */
  link?: { href: string; text: string }
}

export interface NoteSection {
  id: NoteSectionId
  title: string
  notes: DataNote[]
}

/** The popover's closing line: the three About rows that carry each
 *  source's known limitations (anchors are `source-<city>-<id>`). */
export const NOTES_SOURCES: { lead: string; links: readonly { href: string; text: string }[] } = {
  lead: 'Sources and known limitations:',
  links: [
    { href: '/about#source-sf-tkzw-k3nq', text: 'tree inventory' },
    { href: '/about#source-sf-qrwx-q4gg', text: 'removal notices' },
    { href: '/about#source-sf-dd-street-trees', text: 'DataDiver’s street-tree file' },
  ],
}

const INVENTORY_LINK = { href: 'https://data.sf.gov/d/tkzw-k3nq', text: 'Open the city’s tree inventory' }

/** "a", "a and b", "a, b and c" (AP: no serial comma). */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const reportsIn = (y: FallYear): number => y.fallen + y.aboutToFall

function parkCounts(a: TreesAggregates): string {
  const find = (name: string) => a.neighborhoods.find((n) => n.name === name)
  const ggp = find('Golden Gate Park'), presidio = find('Presidio')
  if (!ggp || !presidio) return ''
  return ` The inventory places ${apCount(ggp.trees)} street trees in the Golden Gate Park neighborhood and ` +
    `${apCount(presidio.trees)} in the Presidio.`
}

/** The park-heavy neighborhoods with their measured open-space shares, read
 *  from PARK_HEAVY (ruling R20) — never typed here. */
function parkHeavyList(): string {
  const items = Object.entries(PARK_HEAVY).sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([name, share], i) => `${name} ${share}%${i === 0 ? ' open space' : ''}`)
  return items.length ? ` (${list(items)}, by the Planning Department’s land-use file, Sept. 30, 2026)` : ''
}

function flaggedNames(a: TreesAggregates | null, flag: 'park' | 'low-coverage' | 'small-population'): string {
  if (!a) return ''
  const names = a.neighborhoods.filter((n) => n.flag === flag).map((n) => n.name).sort()
  return names.length ? ` (${list(names)})` : ''
}

const NEAR = `within ${NEARBY_METERS} meters`

/** Final review I2: a noticed site "still in the inventory" may now be listed
 *  as a stump or an empty site, so the note says what those sites hold now
 *  (from the snapshot, once loaded), never the bare figure alone. */
function noticesNote(a: TreesAggregates | null, firstNoticeYear: number | undefined, noticed: NoticedByKind | null): string {
  const lead = 'A removal notice is posted after the city issues a removal permit; it does not show what happened to the tree.'
  if (!a) return `${lead} A site with a notice may still be in the inventory, as a tree, a stump or an empty planting site.`
  const head = `Of the ${apCount(a.notices.sites)} sites with a notice${firstNoticeYear ? ` since ${firstNoticeYear}` : ''}, ` +
    `${apCount(a.notices.listed)} are still in the inventory`
  const kinds = noticed ? noticedKindsList(noticed) : null
  return kinds
    ? `${lead} ${head}: ${kinds}.`
    : `${lead} ${head}, some of them now as a stump or an empty planting site.`
}

function fallReportsNote(a: TreesAggregates | null): string {
  const lead = 'These are 311 requests marked as a fallen tree or a tree about to fall'
  const close = 'A report gives an address or a corner, never a tree.'
  if (!a || a.falls.years.length === 0) {
    return `${lead}. ${close} Reports the city closed as duplicates are left out, and reports with no usable map point ` +
      `count citywide only, so every count of fall reports ${NEAR} is a minimum.`
  }
  const years = [...a.falls.years].sort((x, y) => x.year - y.year)
  const dup = years.reduce((s, y) => s + y.duplicates, 0)
  const unplaced = years.reduce((s, y) => s + y.unplaced, 0)
  let body = `${lead}, since ${years[0].year}. ${close} The ${apCount(dup)} reports the city closed as duplicates are left out`
  body += unplaced > 0 ? `; another ${apCount(unplaced)} have no usable map point and count citywide only.` : '.'
  const gaps = years.filter((y) => !y.placeable)
  if (gaps.length > 0) {
    const parts = gaps.map((y, i) =>
      i === 0 ? `In ${y.year} only ${y.placedShare}% of reports carry a usable map point` : `in ${y.year} only ${y.placedShare}%`)
    body += ` ${list(parts)}, so ${gaps.length === 1 ? 'that year is' : 'those years are'} shown citywide only.`
  }
  // Any unplaced report is one the nearby counts cannot see (ruling R1).
  if (unplaced > 0) body += ` Every count of fall reports ${NEAR} is therefore a minimum.`
  return body
}

function stormYearsNote(a: TreesAggregates | null, nowYear: number): string {
  const close = 'The years are shown side by side and never added into one figure.'
  if (!a || a.falls.years.length === 0) return `Some years hold far more fall reports than others. ${close}`
  // Both figures below are the generator's COMBINED count — the sentence says so.
  const busiest = a.falls.years.reduce((m, y) => (reportsIn(y) > reportsIn(m) || (reportsIn(y) === reportsIn(m) && y.year < m.year) ? y : m))
  const day = a.falls.busiestDay
  const dayYear = Number(day.ymd.slice(0, 4))
  let body = 'Counting fallen-tree and about-to-fall reports together, ' +
    `${busiest.year} has the most of the years shown, ${apCount(reportsIn(busiest))}`
  body += dayYear === busiest.year
    ? `, including ${apCount(day.reports)} filed on ${apDate(day.ymd, nowYear)}`
    : `; the busiest single day was ${apDate(day.ymd, nowYear)}, with ${apCount(day.reports)}`
  const citywide = [...new Set([busiest.year, dayYear])]
    .filter((yr) => a.falls.years.find((y) => y.year === yr)?.placeable === false)
    .sort((x, y) => x - y)
  if (citywide.length > 0) {
    body += `. These are citywide figures, since too few of the ${list(citywide.map(String))} reports carry a map point ` +
      'to split by neighborhood'
  }
  return `${body}. ${close}`
}

const MEASURE_WORDS = { perK: 'per resident', perKm2: 'per square kilometer' } as const

/** Ruling R18, said plainly: the rule, and which neighborhood's removal
 *  changes a reading — computed from the file, so a regeneration names
 *  whatever the data gives (or says no single removal changes either). */
function leadRuleNote(a: TreesAggregates | null): string {
  const rule = 'A pattern is stated only if it still shows when any one neighborhood is left out.'
  if (!a) return rule
  const links = leadLinks(a.neighborhoods)
  const changed = (['perK', 'perKm2'] as const)
    .filter((m) => links[m].breakers.length > 0 && links[m].strength !== linkStrength(links[m].rho))
    .map((m) => {
      const b = links[m].breakers
      const who = b.length === 1 ? b[0] : `any one of ${list(b.map((n) => n)).replace(/ and ([^,]+)$/, ' or $1')}`
      return links[m].strength === 'none'
        ? `counted ${MEASURE_WORDS[m]}, the pattern no longer shows once ${who} is left out, so the sentence states none for that measure`
        : `counted ${MEASURE_WORDS[m]}, the pattern is only weak once ${who} is left out, so the sentence hedges it`
    })
  if (changed.length === 0) return `${rule} Leaving out any one neighborhood changes neither reading.`
  return `${rule} ${changed.map((c, i) => (i === 0 ? c.charAt(0).toUpperCase() + c.slice(1) : c)).join('; ')}.`
}

export function buildDataNotes(a: TreesAggregates | null, nowYear: number, noticed: NoticedByKind | null = null): NoteSection[] {
  const t = a?.totals
  const firstNoticeYear = a?.notices.byYear[0]?.[0]

  return [
    {
      id: 'general',
      title: 'The inventory',
      notes: [
        { title: 'Street trees only', body: PARKS_LINE + (a ? parkCounts(a) : '') },
        {
          title: 'Stumps and empty sites',
          body: (t
            ? `The inventory also lists ${apCount(t.stumps)} stumps, ${apCount(t.emptySites)} empty planting sites and ${apCount(t.shrubs)} shrubs.`
            : 'The inventory also lists stumps, empty planting sites and shrubs.') +
            ' Counts of street trees leave them out. Stumps are drawn as hollow rings.',
        },
        {
          title: 'Sites without a map point',
          body: (t
            ? `The inventory lists ${apCount(t.unmapped)} sites with an address but no map coordinates.`
            : 'Some sites in the inventory carry an address but no map coordinates.') +
            ' They count in citywide figures and are missing from the map and from neighborhood figures.',
          link: INVENTORY_LINK,
        },
      ],
    },
    {
      id: 'explore',
      title: 'Species',
      notes: [
        {
          title: 'Species names',
          body: 'Names appear as the city publishes them. Cultivars and spelling variants are separate entries and are not merged. ' +
            (t
              ? `The ranking leaves out ${apCount(t.speciesNotRecorded)} street trees with no species recorded.`
              : 'Street trees with no species recorded are left out of the ranking.'),
        },
      ],
    },
    {
      id: 'equity',
      title: 'Income and street trees',
      notes: [
        {
          title: 'Two ways to count',
          body: 'Counting per 1,000 residents favors thinly populated neighborhoods; counting per square kilometer does not. ' +
            'The page shows both, and its summary sentence states only what holds under both' +
            (a ? `, across the ${apCount(unflaggedCount(a.neighborhoods))} neighborhoods without a flag.` : '.') +
            ' Population and income come from the American Community Survey, 2019–2023.',
        },
        {
          title: 'Flagged neighborhoods',
          body: `A neighborhood is flagged when it is mostly parkland, since park trees are not in this inventory${flaggedNames(a, 'park')}; ` +
            `when the inventory lists almost no trees there${flaggedNames(a, 'low-coverage')}; when part of its land is open space ` +
            `and the trees there are not in this inventory${parkHeavyList()}, so it is listed, not ranked, while its ` +
            'residential streets count in the citywide figures; or when it has fewer than ' +
            `${apCount(MIN_POPULATION)} residents, so the per-resident figure swings widely${flaggedNames(a, 'small-population')}. ` +
            'Flagged neighborhoods are listed and hatched on the map, but left out of the rank positions, the medians, ' +
            'the color scale and the summary sentence.',
        },
        { title: 'How the summary sentence is decided', body: leadRuleNote(a) },
      ],
    },
    {
      id: 'safety',
      title: 'Trunks, falls and notices',
      notes: [
        {
          title: 'Trunk size',
          body: 'Trunk size is shown as the city last recorded it, on a date the record does not give, in three classes: ' +
            `${TRUNK_LABEL.small}, ${TRUNK_LABEL.medium} and ${TRUNK_LABEL.large}. ` +
            (t
              ? `The record has no measurement for ${apCount(t.unmeasuredTrunks)} street trees`
              : 'Some street trees have no measurement') +
            '; the city’s own size category files those as large, so DataDiver reads the trunk width directly. ' +
            'A wide trunk is not a finding about a tree’s health.',
        },
        { title: 'Fall reports', body: fallReportsNote(a) },
        { title: 'Storm years', body: stormYearsNote(a, nowYear) },
        {
          // Ruling R17 (reverses R16): no rate. Why, in the reader's words.
          title: 'Reports and street trees',
          body: 'Each neighborhood row gives that year’s fallen-tree reports with a map point in the neighborhood and, beside it, ' +
            'the neighborhood’s street trees. No rate is shown, because the two count different things: a report may concern any ' +
            'tree, including park and private trees, while the count beside it is the street trees in the inventory today, not in that year.',
        },
        { title: 'Removal notices', body: noticesNote(a, firstNoticeYear, noticed) },
      ],
    },
    {
      id: 'tree',
      title: 'The tree card',
      notes: [
        {
          title: 'One site, more than one tree',
          body: 'The city’s tree number names a planting site, not a single tree. ' +
            (a
              ? `At ${apCount(a.notices.replantedAfter)} sites the planting date now on record is later than the site’s removal notice, so that notice belongs to an earlier tree.`
              : 'Where the planting date on record is later than the site’s removal notice, that notice belongs to an earlier tree.'),
        },
        {
          title: 'Former trees',
          body: 'When a street tree comes down, the inventory may drop its row or keep the site as a stump or an empty planting site. ' +
            'Stumps, removal notices and DataDiver’s own log of sites that leave the inventory from one saved copy to the next are ' +
            'the records this page uses for former trees. They are not complete: some trees come down with no notice, and the city ' +
            'says trees cut down in an emergency may appear in neither its inventory nor its removal notices.',
        },
      ],
    },
  ]
}
