// src/views/Trees/treesPhrase.test.ts
import { describe, expect, it } from 'vitest'
import type { DisappearedLog } from '@/lib/trees/types'
import * as phrase from './treesPhrase'
import {
  EQUITY_MEASURE, MEDIAN_CAPTION, NO_CENSUS, equityFigure, equityRowLabel, incomeShort, medianTip, otherRankLine,
  disappearedLine, equityFlagNote, equityLead, kindTitle, leftInventoryNote, nearbyFallsLine,
  neighborhoodCountLabel, noAddressLine, noSpeciesMatchLine, noticeLine, plantedLine, shareLine, showAllLine,
  speciesCountTip, speciesPlantedLine, speciesRankLine, speciesRowLabel, streetTreesTip, topFiveLine, trunkLine,
  trunkMixLabel,
} from './treesPhrase'

const c = (pkI: number, pkP: number, kmI: number, kmP: number) =>
  ({ n: 36, perK: { income: pkI, poverty: pkP }, perKm2: { income: kmI, poverty: kmP } })

describe('equityLead — says only what holds under BOTH measures', () => {
  it('strong per resident, weak per area (the Sept. 30, 2026 reading): the first sentence hedges to the weaker side (R10)', () => {
    expect(equityLead(c(0.65, -0.58, 0.33, -0.17))).toBe(
      'Higher-income neighborhoods tend to have more street trees. The link is strong when trees are counted per resident and weak when counted per square kilometer.',
    )
    // the committed aggregates' reading (0.66 vs 0.35) takes the same branch
    expect(equityLead(c(0.66, -0.59, 0.35, -0.19))).toBe(
      'Higher-income neighborhoods tend to have more street trees. The link is strong when trees are counted per resident and weak when counted per square kilometer.',
    )
  })
  it('a quote of the first sentence alone never overclaims: mixed strengths always hedge (R10)', () => {
    for (const [a, b] of [[0.65, 0.33], [0.35, 0.7], [-0.65, -0.33], [-0.35, -0.7]]) {
      const first = equityLead(c(a, 0, b, 0)).split('. ')[0]
      expect(first).toMatch(/ tend to have more street trees$/)
    }
  })
  it('the lower-income mirror of the mixed reading hedges too (R10)', () => {
    expect(equityLead(c(-0.65, 0.58, -0.33, 0.17))).toBe(
      'Lower-income neighborhoods tend to have more street trees. The link is strong when trees are counted per resident and weak when counted per square kilometer.',
    )
  })
  it('same strength under both', () => {
    expect(equityLead(c(0.6, -0.5, 0.55, -0.5))).toBe(
      'Higher-income neighborhoods have more street trees, whether trees are counted per resident or per square kilometer.',
    )
  })
  it('holds under one measure only: no claim, and it says why', () => {
    expect(equityLead(c(0.65, -0.58, 0.1, -0.05))).toBe(
      'Counted per resident, higher-income neighborhoods have more street trees. Counted per square kilometer, there is no clear pattern. The answer depends on the measure.',
    )
  })
  it('opposite signs or nothing: no pattern', () => {
    expect(equityLead(c(0.1, 0, -0.1, 0))).toBe('Street trees show no clear pattern by neighborhood income under either measure.')
  })
  it('weak under both: the sentence hedges (R8)', () => {
    expect(equityLead(c(0.4, 0, 0.35, 0))).toBe(
      'Higher-income neighborhoods tend to have more street trees, whether trees are counted per resident or per square kilometer.',
    )
  })
  it('the other measure alone', () => {
    expect(equityLead(c(0.1, 0, 0.6, 0))).toBe(
      'Counted per square kilometer, higher-income neighborhoods have more street trees. Counted per resident, there is no clear pattern. The answer depends on the measure.',
    )
  })
  it('one measure alone, and only weak: hedged', () => {
    expect(equityLead(c(0.1, 0, 0.4, 0))).toBe(
      'Counted per square kilometer, higher-income neighborhoods tend to have more street trees. Counted per resident, there is no clear pattern. The answer depends on the measure.',
    )
  })
  it('weak per resident, strong per area names each measure’s own tier', () => {
    expect(equityLead(c(0.35, 0, 0.7, 0))).toBe(
      'Higher-income neighborhoods tend to have more street trees. The link is weak when trees are counted per resident and strong when counted per square kilometer.',
    )
  })
  it('a pattern in the other direction is stated, never reported as no pattern (R7)', () => {
    expect(equityLead(c(-0.6, 0.5, -0.55, 0.5))).toBe(
      'Lower-income neighborhoods have more street trees, whether trees are counted per resident or per square kilometer.',
    )
  })
  it('the lower-income mirror hedges when both are weak (R8)', () => {
    expect(equityLead(c(-0.4, 0, -0.32, 0))).toBe(
      'Lower-income neighborhoods tend to have more street trees, whether trees are counted per resident or per square kilometer.',
    )
  })
  it('the two measures pointing opposite ways is said plainly, each with its own strength (R7, R8)', () => {
    expect(equityLead(c(0.6, 0, -0.6, 0))).toBe(
      'The two measures disagree. Counted per resident, higher-income neighborhoods have more street trees, and the link is strong. ' +
        'Counted per square kilometer, lower-income neighborhoods have more, and the link is strong.',
    )
    expect(equityLead(c(0.7, 0, -0.35, 0))).toBe(
      'The two measures disagree. Counted per resident, higher-income neighborhoods have more street trees, and the link is strong. ' +
        'Counted per square kilometer, lower-income neighborhoods have more, and the link is weak.',
    )
  })
})

describe('equity tab lines', () => {
  it('the other measure’s rank, printed small beside a row', () => {
    expect(otherRankLine(33, 'perKm2')).toBe('No. 33 by area')
    expect(otherRankLine(6, 'perK')).toBe('No. 6 per resident')
  })
  it('pills and chip captions name both measures (captions ≤ 4 words)', () => {
    expect(EQUITY_MEASURE).toEqual({ perK: 'Per 1,000 residents', perKm2: 'Per square kilometer' })
    for (const v of Object.values(MEDIAN_CAPTION)) expect(v.split(/\s+/).length).toBeLessThanOrEqual(4)
  })
  it('figures: whole numbers with commas, one decimal under ten', () => {
    expect(equityFigure(448.5)).toBe('449')
    expect(equityFigure(2770.1)).toBe('2,770')
    expect(equityFigure(2.5)).toBe('2.5')
    expect(equityFigure(3)).toBe('3.0')
  })
  it('income in thousands, never a dollar zero', () => {
    expect(incomeShort(105807.78)).toBe('$106K')
    expect(incomeShort(238958.91)).toBe('$239K')
    expect(NO_CENSUS).toBe('No census figure')
  })
  it('the median chip’s sentence names its denominator and its unflagged scope', () => {
    expect(medianTip('perK', 164.2, 36)).toBe(
      'Among the 36 neighborhoods without a flag, the middle one has 164 street trees per 1,000 residents.',
    )
    expect(medianTip('perKm2', 1497.9, 36)).toBe(
      'Among the 36 neighborhoods without a flag, the middle one has 1,498 street trees per square kilometer.',
    )
  })
  it('a row’s sentence: ranked, flagged, and with no census figure', () => {
    expect(equityRowLabel({ name: 'Tenderloin', value: 51.8, position: 34, otherPosition: 15, medianIncome: 62729.66, flag: null }, 'perK')).toBe(
      'No. 34, Tenderloin: 52 street trees per 1,000 residents. No. 15 by area. Median household income $63K.',
    )
    expect(equityRowLabel({ name: 'Presidio', value: 14.1, position: null, otherPosition: null, medianIncome: 233828.79, flag: 'park' }, 'perKm2')).toBe(
      'Presidio: 14 street trees per square kilometer. Not ranked: Mostly parkland. Park trees are not in this inventory. Median household income $234K.',
    )
    expect(equityRowLabel({ name: 'Lincoln Park', value: 61.5, position: null, otherPosition: null, medianIncome: null, flag: 'park' }, 'perK')).toBe(
      'Lincoln Park: 62 street trees per 1,000 residents. Not ranked: Mostly parkland. Park trees are not in this inventory. No census figure.',
    )
  })
})

describe('card lines never claim more than the record', () => {
  it('a notice older than the tree belongs to an earlier tree', () => {
    expect(noticeLine('earlier-tree', '2018-02-27', 'Posted 30 Day', 2026))
      .toBe('A removal notice (30-day) was posted for an earlier tree at this site on Feb. 27, 2018.')
  })
  it('otherwise it is a notice at this site, not a removal', () => {
    expect(noticeLine('this-site', '2026-06-26', 'Posted 15 Day', 2026))
      .toBe('A removal notice (15-day) was posted at this site on June 26.')
    expect(noticeLine('this-site', '2024-01-05', 'Posted 24hr', 2026))
      .toBe('A removal notice (24-hour) was posted at this site on Jan. 5, 2024.')
  })
  it('an unknown notice type carries no parenthesis', () => {
    expect(noticeLine('this-site', '2024-01-05', 'Something else', 2026))
      .toBe('A removal notice was posted at this site on Jan. 5, 2024.')
  })
  it('fall reports are nearby reports', () => {
    expect(nearbyFallsLine(0, 2021)).toBe('No fall reports within 30 meters since 2021.')
    expect(nearbyFallsLine(1, 2021)).toBe('1 fall report within 30 meters since 2021.')
    expect(nearbyFallsLine(4, 2021)).toBe('4 fall reports within 30 meters since 2021.')
  })
  it('rank and share lines', () => {
    expect(speciesRankLine(3, 544)).toBe('No. 3 of 544 recorded species')
    expect(topFiveLine(24.2)).toBe('The five most common species are 24.2% of street trees.')
  })
  it('explore lines: street trees in every count, planting where recorded', () => {
    expect(speciesPlantedLine([1998, 2024], 1007, 8943)).toBe('Planted 1998–2024 where recorded (1,007 of 8,943)')
    expect(speciesPlantedLine([2026, 2026], 1, 1)).toBe('Planted 2026 where recorded (1 of 1)')
    expect(speciesPlantedLine(null, 0, 12)).toBe('No planting dates recorded')
    expect(speciesPlantedLine([2000, 2001], 0, 12)).toBe('No planting dates recorded')
    expect(speciesRowLabel(1, 'Sycamore, London Plane', 8943)).toBe('No. 1, Sycamore, London Plane: 8,943 street trees')
    expect(speciesRowLabel(532, 'zelk', 1)).toBe('No. 532, zelk: 1 street tree')
    expect(shareLine('6.3%')).toBe('6.3% of street trees')
    expect(trunkMixLabel('11 to 20 inches', 3514, 8943)).toBe('Trunk size as recorded, 11 to 20 inches: 3,514 of 8,943 street trees')
    expect(noAddressLine(' 1330 Bush ')).toBe('No street tree address starts with “1330 Bush”.')
    expect(showAllLine(639)).toBe('Show all 639 species')
  })
  it('flag notes', () => {
    expect(equityFlagNote('park')).toBe('Mostly parkland. Park trees are not in this inventory.')
    expect(equityFlagNote('low-coverage')).toBe('The inventory lists almost no trees here.')
    expect(equityFlagNote('small-population')).toBe('Fewer than 2,000 residents, so the per-resident figure swings widely.')
    expect(equityFlagNote(null)).toBeNull()
  })
  it('a site that left the inventory: only a tree row speaks of a tree', () => {
    expect(leftInventoryNote('2026-09-30', 2026, 'tree'))
      .toBe('This site is not in the city’s inventory. It was there on Sept. 30; the tree may have been taken out.')
    for (const kind of ['stump', 'site', 'shrub'] as const) {
      expect(leftInventoryNote('2026-09-30', 2026, kind)).toBe('This site is not in the city’s inventory. It was there on Sept. 30.')
    }
    expect(phrase.UNKNOWN_SITE).toBe('No street tree site has this number.')
    expect(phrase.CARD_ERROR).toBe('The city’s tree record did not load.')
  })
  it('card labels: kind titles, planting and trunk size as recorded', () => {
    expect(kindTitle('stump')).toBe('Stump')
    expect(kindTitle('site')).toBe('Empty planting site')
    expect(kindTitle('shrub')).toBe('Shrub')
    expect(plantedLine('2026-05-07T00:00:00.000', 2026)).toBe('Planted May 7')
    expect(plantedLine(null, 2026)).toBe('Planting date not recorded')
    expect(trunkLine(3, '10 inches or narrower')).toBe('3 inches (10 inches or narrower)')
    expect(trunkLine(1, '10 inches or narrower')).toBe('1 inch (10 inches or narrower)')
    expect(trunkLine(null, 'Not measured')).toBe('Not measured')
  })
  it('the disappeared log', () => {
    expect(disappearedLine({ trackingSince: '2026-09-30', runs: [] }, 2026))
      .toBe('DataDiver began recording which sites leave the inventory on Sept. 30.')
    expect(disappearedLine({
      trackingSince: '2026-09-30',
      runs: [{ from: '2026-09-30', to: '2026-10-14', gone: [7], changed: [] }],
    }, 2026)).toBe('1 site left the inventory between Sept. 30 and Oct. 14.')
    expect(disappearedLine({
      trackingSince: '2026-09-30',
      runs: [
        { from: '2026-09-30', to: '2026-10-14', gone: [1, 2], changed: [] },
        { from: '2026-10-14', to: '2027-01-02', gone: Array.from({ length: 1234 }, (_, i) => i), changed: [] },
      ],
    }, 2027)).toBe('1,234 sites left the inventory between Oct. 14, 2026 and Jan. 2.')
  })
})

describe('jargon ban — statistics words and over-claims never reach a reader', () => {
  const BANNED = /σ|sigma|z-?score|ρ|\brho\b|spearman|correlat|baseline|\blive\b|\bage\b|removed|\bfell\b/i
  const log = (gone: number[]): DisappearedLog => ({ trackingSince: '2026-09-30', runs: gone.length ? [{ from: '2026-09-30', to: '2026-10-14', gone, changed: [] }] : [] })

  it('no exported string constant carries one', () => {
    for (const [k, v] of Object.entries(phrase)) if (typeof v === 'string' && BANNED.test(v)) throw new Error(`${k}: ${v}`)
  })
  it('no generated sentence, from any exported function or branch, carries one', () => {
    const out = [
      // equityLead — every branch
      equityLead(c(0.65, -0.58, 0.33, -0.17)), equityLead(c(0.35, 0, 0.7, 0)),
      equityLead(c(0.6, -0.5, 0.55, -0.5)), equityLead(c(0.4, 0, 0.35, 0)),
      equityLead(c(-0.6, 0.5, -0.55, 0.5)), equityLead(c(-0.4, 0, -0.32, 0)),
      equityLead(c(0.65, -0.58, 0.1, -0.05)), equityLead(c(0.1, 0, 0.6, 0)), equityLead(c(0.1, 0, 0.4, 0)),
      equityLead(c(-0.6, 0, 0.1, 0)),
      equityLead(c(0.6, 0, -0.6, 0)), equityLead(c(0.7, 0, -0.35, 0)),
      equityLead(c(0, 0, 0, 0)), equityLead(c(0.1, 0, -0.1, 0)),
      // the R10 mixed branch, both directions
      equityLead(c(-0.65, 0.58, -0.33, 0.17)), equityLead(c(-0.35, 0, -0.7, 0)),
      // equity tab — every exported function, every branch
      otherRankLine(33, 'perKm2'), otherRankLine(6, 'perK'),
      ...Object.values(EQUITY_MEASURE), ...Object.values(MEDIAN_CAPTION), ...Object.values(phrase.EQUITY_LEGEND_HEAD), NO_CENSUS,
      equityFigure(448.5), equityFigure(2.5), incomeShort(105807.78),
      medianTip('perK', 164.2, 36), medianTip('perKm2', 1497.9, 36),
      ...(['perK', 'perKm2'] as const).flatMap((by) => [
        equityRowLabel({ name: 'Tenderloin', value: 51.8, position: 34, otherPosition: 15, medianIncome: 62729.66, flag: null }, by),
        ...(['park', 'low-coverage', 'small-population'] as const).flatMap((flag) => [
          equityRowLabel({ name: 'X', value: 2.5, position: null, otherPosition: null, medianIncome: 91750, flag }, by),
          equityRowLabel({ name: 'X', value: 2.5, position: null, otherPosition: null, medianIncome: null, flag }, by),
        ]),
      ]),
      // equityFlagNote — every value
      ...(['park', 'low-coverage', 'small-population', null] as const).map((f) => equityFlagNote(f) ?? ''),
      // leftInventoryNote — every kind
      ...(['tree', 'stump', 'site', 'shrub'] as const).map((k) => leftInventoryNote('2025-03-01', 2026, k)),
      // disappearedLine — no runs, one site, many sites
      disappearedLine(log([]), 2026), disappearedLine(log([1]), 2026), disappearedLine(log([1, 2, 3]), 2026),
      speciesRankLine(1, 639), topFiveLine(24.6),
      // Explore tab — every exported function, every branch
      streetTreesTip(142014), speciesCountTip(639),
      speciesRowLabel(1, 'Sycamore, London Plane', 8943), speciesRowLabel(532, 'zelk', 1),
      shareLine('6.3%'), shareLine('<0.1%'),
      trunkMixLabel('10 inches or narrower', 4105, 8943),
      speciesPlantedLine([1956, 2026], 1007, 8943), speciesPlantedLine([2026, 2026], 1, 1), speciesPlantedLine(null, 0, 12),
      neighborhoodCountLabel('Pacific Heights', 935), neighborhoodCountLabel('Presidio', 1),
      showAllLine(639), noSpeciesMatchLine(' zzz '), noAddressLine('1330 Bush'),
      // noticeLine — both readings × the three types + an unknown type
      ...(['earlier-tree', 'this-site'] as const).flatMap((r) =>
        ['Posted 24hr', 'Posted 15 Day', 'Posted 30 Day', 'Other'].map((t) => noticeLine(r, '2018-02-27', t, 2026))),
      nearbyFallsLine(0, 2021), nearbyFallsLine(1, 2021), nearbyFallsLine(3, 2021),
      phrase.UNKNOWN_SITE, phrase.UNDATED_NOTICE, phrase.CARD_ERROR,
      // card labels — every kind, both planting branches, both trunk branches
      ...(['stump', 'site', 'shrub'] as const).map((k) => kindTitle(k)),
      plantedLine('2026-05-07', 2026), plantedLine(null, 2026),
      trunkLine(3, '10 inches or narrower'), trunkLine(1, '10 inches or narrower'), trunkLine(null, 'Not measured'),
    ]
    expect(out.length).toBeGreaterThan(30)
    for (const s of out) if (BANNED.test(s)) throw new Error(s)
  })
})
