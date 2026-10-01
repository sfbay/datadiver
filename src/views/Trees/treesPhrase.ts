// src/views/Trees/treesPhrase.ts
//
// The Trees view's writing layer: every reader-facing sentence the view
// generates, pure and tested. Word rules (plan, Global Constraints): "street
// trees", "trunk size as recorded" (never an age), "removal notice" (a posted
// notice, never a removal), "fall reports nearby" (a report names an address,
// never a tree), "left the inventory". No statistics words reach a reader —
// treesPhrase.test.ts fails the build if one does.

import type { EquityCorrelations, EquityFlag, LinkStrength } from '@/lib/trees/equity'
import { MIN_POPULATION, linkStrength } from '@/lib/trees/equity'
import { NEARBY_METERS } from '@/lib/trees/fallReports'
import type { NoticeReading } from '@/lib/trees/siteNotices'
import type { RowKind } from '@/lib/trees/species'
import type { DisappearedLog } from '@/lib/trees/types'
import { apDate } from '@/utils/apDate'

/** Figures with thousands commas. Local on purpose: Restaurants' apCount
 *  spells out one–nine, and views do not import each other's phrase layers. */
export function apCount(n: number): string {
  return n.toLocaleString('en-US')
}

export const SUBHEAD = 'Every street tree the city keeps on record'
export const PARKS_LINE = 'Street trees only. Trees inside parks and the Presidio are not in this inventory.'
export const TRUNK_NOTE = 'Trunk size as the city last recorded it. The record does not say when.'
export const STUMP_LEGEND = 'A stump stands here'
export const FALLS_LEGEND = '311 reports of a fallen tree'
export const UNKNOWN_SITE = 'No street tree site has this number.'
export const UNDATED_NOTICE = 'A removal notice with no posted date is on record for this site.'
export const CARD_ERROR = 'This site’s record did not load.'

export function speciesRankLine(rank: number, of: number): string {
  return `No. ${rank} of ${apCount(of)} recorded species`
}

export function topFiveLine(share: number): string {
  return `The five most common species are ${share}% of street trees.`
}

// ── Equity lead ──────────────────────────────────────────────────────────────
// Income pair only. A measure "holds" when its link is at least weak; its
// direction is the sign. The sentence states only what both measures support.

const MEASURE = { perK: 'per resident', perKm2: 'per square kilometer' } as const
type Measure = keyof typeof MEASURE

const incomeSide = (positive: boolean): string => (positive ? 'higher-income' : 'lower-income')
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "have more" for a strong link, "tend to have more" for a weak one (ruling R8). */
const haveMore = (strength: LinkStrength): string => (strength === 'strong' ? 'have more' : 'tend to have more')

export function equityLead(c: EquityCorrelations): string {
  const a: LinkStrength = linkStrength(c.perK.income)
  const b: LinkStrength = linkStrength(c.perKm2.income)
  const aHolds = a !== 'none', bHolds = b !== 'none'

  if (aHolds && bHolds) {
    const aPos = c.perK.income > 0, bPos = c.perKm2.income > 0
    if (aPos !== bPos) {
      // Each side names its own strength, so a weak side never stands level with a strong one.
      return `The two measures disagree. Counted ${MEASURE.perK}, ${incomeSide(aPos)} neighborhoods have more street trees, ` +
        `and the link is ${a}. Counted ${MEASURE.perKm2}, ${incomeSide(bPos)} neighborhoods have more, and the link is ${b}.`
    }
    const side = cap(incomeSide(aPos))
    if (a === b) return `${side} neighborhoods ${haveMore(a)} street trees, whether trees are counted ${MEASURE.perK} or ${MEASURE.perKm2}.`
    return `${side} neighborhoods have more street trees. The link is ${a} when trees are counted ${MEASURE.perK} and ${b} when counted ${MEASURE.perKm2}.`
  }

  if (aHolds !== bHolds) {
    const holds: Measure = aHolds ? 'perK' : 'perKm2'
    const other: Measure = aHolds ? 'perKm2' : 'perK'
    const positive = c[holds].income > 0
    return `Counted ${MEASURE[holds]}, ${incomeSide(positive)} neighborhoods ${haveMore(aHolds ? a : b)} street trees. ` +
      `Counted ${MEASURE[other]}, there is no clear pattern. The answer depends on the measure.`
  }

  return 'Street trees show no clear pattern by neighborhood income under either measure.'
}

export function equityFlagNote(flag: EquityFlag): string | null {
  switch (flag) {
    case 'park': return 'Mostly parkland. Park trees are not in this inventory.'
    case 'low-coverage': return 'The inventory lists almost no trees here.'
    case 'small-population': return `Fewer than ${apCount(MIN_POPULATION)} residents, so the per-resident figure swings widely.`
    default: return null
  }
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

export function nearbyFallsLine(n: number, sinceYear: number): string {
  const near = `within ${NEARBY_METERS} meters since ${sinceYear}.`
  if (n === 0) return `No fall reports ${near}`
  return `${apCount(n)} fall report${n === 1 ? '' : 's'} ${near}`
}

/** For a site whose last known row was a stump, an empty site or a shrub,
 *  nothing is claimed about a tree. */
export function leftInventoryNote(asOf: string, nowYear: number, kind: RowKind): string {
  const was = `This site is not in the city’s inventory. It was there on ${apDate(asOf, nowYear)}`
  return kind === 'tree' ? `${was}; the tree may have been taken out.` : `${was}.`
}

export function disappearedLine(log: DisappearedLog, nowYear: number): string {
  const latest = log.runs[log.runs.length - 1]
  if (!latest) return `DataDiver began recording which sites leave the inventory on ${apDate(log.trackingSince, nowYear)}.`
  const n = latest.gone.length
  return `${apCount(n)} site${n === 1 ? '' : 's'} left the inventory between ${apDate(latest.from, nowYear)} and ${apDate(latest.to, nowYear)}.`
}
