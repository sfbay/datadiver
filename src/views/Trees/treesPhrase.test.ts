// src/views/Trees/treesPhrase.test.ts
import { describe, expect, it } from 'vitest'
import { linkStrength } from '@/lib/trees/equity'
import type { DisappearedLog, FallYear } from '@/lib/trees/types'
import * as phrase from './treesPhrase'
import {
  EQUITY_MEASURE, MEDIAN_CAPTION, NO_CENSUS, equityFigure, equityRowLabel, incomeShort, medianTip, otherRankLine,
  disappearedLine, equityFlagNote, equityLead, kindTitle, leftInventoryNote, nearbyFallsLine,
  neighborhoodCountLabel, noAddressLine, noSpeciesMatchLine, noticeLine, plantedLine, shareLine, showAllLine,
  speciesCountTip, speciesPlantedLine, speciesRankLine, speciesRowLabel, streetTreesTip, topFiveLine, trunkLine,
  trunkMixLabel,
} from './treesPhrase'

/** A lead input whose robust tier equals the plain tier of each figure (the
 *  leave-one-out step lives in robustLink, tested in equity.test.ts). The
 *  poverty arguments are kept so each case still reads as one row of figures;
 *  the lead never reads them. */
const c = (pkI: number, _pkP: number, kmI: number, _kmP: number) =>
  ({ perK: { rho: pkI, strength: linkStrength(pkI) }, perKm2: { rho: kmI, strength: linkStrength(kmI) } })

describe('equityLead — says only what holds under BOTH measures', () => {
  it('strong per resident, weak per area (the Sept. 30, 2026 reading): the first sentence hedges to the weaker side (R10)', () => {
    expect(equityLead(c(0.65, -0.58, 0.33, -0.17))).toBe(
      'Higher-income neighborhoods tend to have more street trees. The link is strong when trees are counted per resident and weak when counted per square kilometer.',
    )
  })
  it('reads the ROBUST tier, not the full set’s: per area survives on all 36 but not without one neighborhood (R18)', () => {
    expect(equityLead({ perK: { rho: 0.66, strength: 'strong' }, perKm2: { rho: 0.35, strength: 'none' } })).toBe(
      'Counted per resident, higher-income neighborhoods have more street trees. Counted per square kilometer, there is no clear pattern. The answer depends on the measure.',
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
  it('the median chip’s sentence names its denominator and its unflagged scope; an even count averages the middle two', () => {
    expect(medianTip('perK', 164.2, 36)).toBe(
      'Among the 36 neighborhoods without a flag, the middle two average 164 street trees per 1,000 residents.',
    )
    expect(medianTip('perKm2', 1497.9, 36)).toBe(
      'Among the 36 neighborhoods without a flag, the middle two average 1,498 street trees per square kilometer.',
    )
    expect(medianTip('perK', 164.2, 35)).toBe(
      'Among the 35 neighborhoods without a flag, the middle one has 164 street trees per 1,000 residents.',
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
  it('fall reports are nearby MAPPED reports, in both branches (R19)', () => {
    expect(nearbyFallsLine(0, 2021)).toBe('No mapped fall reports within 30 meters since 2021.')
    expect(nearbyFallsLine(1, 2021)).toBe('1 mapped fall report within 30 meters since 2021.')
    expect(nearbyFallsLine(4, 2021)).toBe('4 mapped fall reports within 30 meters since 2021.')
  })
  it('the search example is an address the inventory holds (re-probed at each regeneration)', () => {
    expect(phrase.SEARCH_PLACEHOLDER).toBe('Species, or an address like 1300 Bush')
  })
  it('rank and share lines', () => {
    expect(speciesRankLine(3, 544)).toBe('No. 3 of 544 species names')
    expect(topFiveLine(24.2)).toBe('The five most common species names are 24.2% of street trees.')
    expect(phrase.CAPTION_TOP_FIVE).toBe('Top five names')
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
    expect(noAddressLine(' 1330 Bush ')).toBe('No inventory site address starts with “1330 Bush”.')
    expect(showAllLine(639)).toBe('Show all 639 species names')
    expect(noSpeciesMatchLine(' zzz ')).toBe('No species name matches “zzz”.')
    expect(speciesCountTip(639)).toBe(
      'The inventory uses 639 different species names, each as the city publishes it. Cultivars and spelling variants count as separate names.')
    expect(phrase.CAPTION_SPECIES).toBe('Species names')
    expect(phrase.TOP_NEIGHBORHOODS_HEADING).toBe('Neighborhoods with the most of this species')
    expect(phrase.unmeasuredLegendLine(5123)).toBe('No trunk measurement (5,123): drawn at the smallest size')
  })
  it('flag notes', () => {
    expect(equityFlagNote('park')).toBe('Mostly parkland. Park trees are not in this inventory.')
    expect(equityFlagNote('low-coverage')).toBe('The inventory lists almost no trees here.')
    expect(equityFlagNote('small-population')).toBe('Fewer than 2,000 residents, so the per-resident figure swings widely.')
    expect(equityFlagNote(null)).toBeNull()
  })
  it('a site that left the inventory: no cause is claimed, for any kind of site', () => {
    expect(leftInventoryNote('2026-09-30', 2026))
      .toBe('This site is no longer listed in the city’s inventory. It was there on Sept. 30; the record does not say why.')
    expect(leftInventoryNote('2026-09-30', 2026)).not.toMatch(/taken out|tree/)
    expect(phrase.FORMER_HEAD).toBe('Sites that left the inventory')
    expect(phrase.TRUNK_NOTE_NOT_TREE).toBe(
      'The city’s record still carries a trunk size for this site. It does not say which tree was measured, or when.')
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

// ── every export, every branch ───────────────────────────────────────────────
// Representative calls for EVERY exported function of treesPhrase.ts. The
// scans below walk `Object.entries(phrase)`: a string constant is read
// directly, a record of strings by value, and a function through its entry
// here — so a new function export with no entry FAILS THE BUILD, and no
// hand-kept list of names can fall behind the module.

const fy = (year: number, partial: boolean, placeable: boolean): FallYear =>
  ({ year, fallen: 1, aboutToFall: 1, duplicates: 0, unplaced: 0, placedShare: placeable ? 100 : 46.2, placeable, partial })
const log = (gone: number[]): DisappearedLog =>
  ({ trackingSince: '2026-09-30', runs: gone.length ? [{ from: '2026-09-30', to: '2026-10-14', gone, changed: [] }] : [] })
const BARS = [true, false].flatMap((partial) => [true, false].map((placeable) => ({ year: 2023, fallen: 4390, aboutToFall: 436, partial, placeable })))
const LEFT_OUT_SHAPES: FallYear[][] = [
  [fy(2022, false, false), fy(2023, false, false), fy(2026, true, true)],
  [fy(2025, false, false)], [fy(2026, true, true)], [fy(2026, true, false)], [fy(2025, false, true)],
]
const FLAGS = ['park', 'low-coverage', 'small-population'] as const
const BY = ['perK', 'perKm2'] as const

const SAMPLES: Record<string, () => readonly (string | null)[]> = {
  apCount: () => [phrase.apCount(144504), phrase.apCount(1)],
  speciesRankLine: () => [speciesRankLine(1, 639)],
  topFiveLine: () => [topFiveLine(24.6)],
  streetTreesTip: () => [streetTreesTip(142014)],
  speciesCountTip: () => [speciesCountTip(639), speciesCountTip(1)],
  speciesRowLabel: () => [speciesRowLabel(1, 'Sycamore, London Plane', 8943), speciesRowLabel(532, 'zelk', 1)],
  shareLine: () => [shareLine('6.3%'), shareLine('<0.1%')],
  trunkMixLabel: () => [trunkMixLabel('10 inches or narrower', 4105, 8943)],
  speciesPlantedLine: () => [
    speciesPlantedLine([1956, 2026], 1007, 8943), speciesPlantedLine([2026, 2026], 1, 1), speciesPlantedLine(null, 0, 12),
  ],
  neighborhoodCountLabel: () => [neighborhoodCountLabel('Pacific Heights', 935), neighborhoodCountLabel('Presidio', 1)],
  showAllLine: () => [showAllLine(639)],
  noSpeciesMatchLine: () => [noSpeciesMatchLine(' zzz ')],
  noAddressLine: () => [noAddressLine('1330 Bush')],
  // equityLead — every branch, both directions, the R10 mixed branch
  equityLead: () => [
    c(0.65, -0.58, 0.33, -0.17), c(0.35, 0, 0.7, 0), c(0.6, -0.5, 0.55, -0.5), c(0.4, 0, 0.35, 0),
    c(-0.6, 0.5, -0.55, 0.5), c(-0.4, 0, -0.32, 0), c(0.65, -0.58, 0.1, -0.05), c(0.1, 0, 0.6, 0), c(0.1, 0, 0.4, 0),
    c(-0.6, 0, 0.1, 0), c(0.6, 0, -0.6, 0), c(0.7, 0, -0.35, 0), c(0, 0, 0, 0), c(0.1, 0, -0.1, 0),
    c(-0.65, 0.58, -0.33, 0.17), c(-0.35, 0, -0.7, 0),
  ].map((x) => equityLead(x)),
  equityFlagNote: () => [...FLAGS, null].map((f) => equityFlagNote(f)),
  equityFigure: () => [equityFigure(448.5), equityFigure(2.5)],
  incomeShort: () => [incomeShort(105807.78)],
  otherRankLine: () => [otherRankLine(33, 'perKm2'), otherRankLine(6, 'perK')],
  medianTip: () => [medianTip('perK', 164.2, 36), medianTip('perKm2', 1497.9, 36), medianTip('perK', 164.2, 35)],
  equityRowLabel: () => BY.flatMap((by) => [
    equityRowLabel({ name: 'Tenderloin', value: 51.8, position: 34, otherPosition: 15, medianIncome: 62729.66, flag: null }, by),
    ...FLAGS.flatMap((flag) => [
      equityRowLabel({ name: 'X', value: 2.5, position: null, otherPosition: null, medianIncome: 91750, flag }, by),
      equityRowLabel({ name: 'X', value: 2.5, position: null, otherPosition: null, medianIncome: null, flag }, by),
    ]),
  ]),
  // noticeLine — both readings × the three types + an unknown type
  noticeLine: () => (['earlier-tree', 'this-site'] as const).flatMap((r) =>
    ['Posted 24hr', 'Posted 15 Day', 'Posted 30 Day', 'Other'].map((t) => noticeLine(r, '2018-02-27', t, 2026))),
  kindTitle: () => (['stump', 'site', 'shrub'] as const).map((k) => kindTitle(k)),
  plantedLine: () => [plantedLine('2026-05-07', 2026), plantedLine(null, 2026)],
  trunkLine: () => [trunkLine(3, '10 inches or narrower'), trunkLine(1, '10 inches or narrower'), trunkLine(null, 'Not measured')],
  nearbyFallsLine: () => [nearbyFallsLine(0, 2021), nearbyFallsLine(1, 2021), nearbyFallsLine(3, 2021)],
  leftInventoryNote: () => [leftInventoryNote('2025-03-01', 2026), leftInventoryNote('2026-09-30', 2026)],
  disappearedLine: () => [disappearedLine(log([]), 2026), disappearedLine(log([1]), 2026), disappearedLine(log([1, 2, 3]), 2026)],
  unmeasuredLegendLine: () => [phrase.unmeasuredLegendLine(5123), phrase.unmeasuredLegendLine(1)],
  largeTrunksLine: () => [phrase.largeTrunksLine(8633), phrase.largeTrunksLine(1)],
  stumpsLine: () => [phrase.stumpsLine(635), phrase.stumpsLine(1)],
  fallChipCaption: () => [phrase.fallChipCaption(2025)],
  fallChipTip: () => [phrase.fallChipTip(2025, 1592, 752), phrase.fallChipTip(2025, 1, 0)],
  fallBarLabel: () => [
    ...BARS.map((b) => phrase.fallBarLabel(b)),
    phrase.fallBarLabel({ year: 2023, fallen: 1, aboutToFall: 1, partial: false, placeable: true }),
  ],
  fallBarCaptions: () => BARS.flatMap((b) => phrase.fallBarCaptions(b)),
  yearsLeftOutLine: () => LEFT_OUT_SHAPES.map((ys) => phrase.yearsLeftOutLine(ys)),
  busiestDayLine: () => [
    phrase.busiestDayLine({ ymd: '2023-03-21', reports: 467 }, 2026), phrase.busiestDayLine({ ymd: '2026-01-02', reports: 1 }, 2026),
  ],
  safetyRowLabel: () => [
    phrase.safetyRowLabel({ name: 'Mission', fallen: 90, aboutToFall: 10, trees: 9000, largeTrunks: 40, stumps: 3 }, 2025),
    phrase.safetyRowLabel({ name: 'X', fallen: 1, aboutToFall: 1, trees: 1, largeTrunks: 1, stumps: 1 }, 2025),
  ],
  noticesListedLabel: () => [phrase.noticesListedLabel(4831, 5571)],
  noticeTypeLabel: () => [phrase.noticeTypeLabel('Posted 24hr', 1354), phrase.noticeTypeLabel('Posted 15 Day', 1)],
  noticesTotalLine: () => [
    phrase.noticesTotalLine(5713, 2017, 5571, 3), phrase.noticesTotalLine(1, null, 1, 0), phrase.noticesTotalLine(2, null, 1, 1),
  ],
  replantedAfterLine: () => [phrase.replantedAfterLine(1022), phrase.replantedAfterLine(1)],
  noticedKindsList: () => [
    phrase.noticedKindsList({ tree: 4368, stump: 136, site: 325, shrub: 2 }), phrase.noticedKindsList({ tree: 0, stump: 0, site: 0, shrub: 0 }),
  ],
  noticedKindsLine: () => [
    phrase.noticedKindsLine({ tree: 4368, stump: 136, site: 325, shrub: 2 }), phrase.noticedKindsLine({ tree: 1, stump: 0, site: 2, shrub: 0 }),
    phrase.noticedKindsLine({ tree: 0, stump: 1, site: 0, shrub: 0 }), phrase.noticedKindsLine({ tree: 0, stump: 0, site: 0, shrub: 0 }),
  ],
}

/** Every reader string the module can produce, labelled by export name. */
function allReaderText(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const [name, value] of Object.entries(phrase)) {
    if (typeof value === 'string') out.push({ name, text: value })
    else if (typeof value === 'function') {
      const sample = SAMPLES[name]
      if (!sample) throw new Error(`${name}: add representative calls (every branch) to SAMPLES`)
      for (const t of sample()) out.push({ name, text: t ?? '' })
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value)) {
        if (typeof v !== 'string') throw new Error(`${name}: a record of reader strings may hold only strings`)
        out.push({ name, text: v })
      }
    } else throw new Error(`${name}: an export the scans do not know how to read`)
  }
  return out
}

describe('every export of treesPhrase.ts is scanned', () => {
  it('every exported function has samples; SAMPLES names nothing that is not an exported function', () => {
    for (const [name, value] of Object.entries(phrase)) {
      if (typeof value === 'function') expect(Object.keys(SAMPLES), `${name}: add it to SAMPLES`).toContain(name)
    }
    for (const name of Object.keys(SAMPLES)) expect(typeof (phrase as Record<string, unknown>)[name], name).toBe('function')
  })
  it('each entry calls its own function', () => {
    for (const [name, sample] of Object.entries(SAMPLES)) expect(sample.toString(), name).toMatch(new RegExp(`\\b${name}\\b`))
  })
  it('the scan is not empty', () => {
    expect(allReaderText().length).toBeGreaterThan(100)
  })
})

describe('jargon ban — statistics words and over-claims never reach a reader', () => {
  const BANNED = /σ|sigma|z-?score|ρ|\brho\b|spearman|correlat|baseline|\blive\b|\bage\b|removed|taken out|\bfell\b|per 1,000 street trees/i
  it('no exported constant, record value or generated sentence, from any branch, carries one', () => {
    for (const { name, text } of allReaderText()) if (BANNED.test(text)) throw new Error(`${name}: ${text}`)
  })
})

describe('no sentence scores a tree', () => {
  const SCORING = /dangerous|hazard|\brisk|at-risk/i
  it('no exported constant, record value or generated sentence, from any branch, carries a scoring word', () => {
    for (const { name, text } of allReaderText()) if (SCORING.test(text)) throw new Error(`${name}: ${text}`)
  })
})
