// src/views/Trees/safetyView.test.ts
import { describe, expect, it } from 'vitest'
import type { FallYear, NeighborhoodAggregate } from '@/lib/trees/types'
import * as phrase from './treesPhrase'
import {
  fallBars, latestFullYear, neighborhoodYears, safetyRows,
} from './safetyView'

const fy = (year: number, fallen: number, aboutToFall: number, partial = false, placeable = true): FallYear =>
  ({ year, fallen, aboutToFall, duplicates: 0, unplaced: 0, placedShare: placeable ? 100 : 46.2, placeable, partial })

/** The committed aggregates' shape on Sept. 30, 2026: 2022 and 2023 cannot
 *  be placed, 2026 is partial. */
const REAL_SHAPE: FallYear[] = [
  fy(2021, 1121, 263), fy(2022, 621, 192, false, false), fy(2023, 4390, 436, false, false),
  fy(2024, 2474, 540), fy(2025, 1592, 752), fy(2026, 889, 582, true),
]

describe('fallBars — years side by side on ONE scale, never summed', () => {
  const bars = fallBars([fy(2022, 600, 100, false, false), fy(2023, 4500, 900), fy(2026, 900, 200, true)])
  it('shares the storm year\'s scale', () => {
    expect(bars.map((b) => b.max)).toEqual([5400, 5400, 5400])
  })
  it('keeps the two kinds apart and marks the partial year', () => {
    expect(bars[1]).toMatchObject({ year: 2023, fallen: 4500, aboutToFall: 900, partial: false })
    expect(bars[2].partial).toBe(true)
  })
  it('passes placeable through, so an unplaceable year is captioned citywide only (R1)', () => {
    expect(bars.map((b) => b.placeable)).toEqual([false, true, true])
  })
  it('shows EVERY year, in year order', () => {
    expect(fallBars([...REAL_SHAPE].reverse()).map((b) => b.year)).toEqual([2021, 2022, 2023, 2024, 2025, 2026])
  })
  it('an empty list is empty, never a divide by zero', () => {
    expect(fallBars([])).toEqual([])
    expect(fallBars([fy(2021, 0, 0)])[0].max).toBe(0)
  })
})

describe('neighborhoodYears — placeable AND full years only (R1)', () => {
  it('the committed shape offers 2021, 2024 and 2025', () => {
    expect(neighborhoodYears(REAL_SHAPE)).toEqual([2021, 2024, 2025])
  })
  it('an unplaceable year never appears, full or partial', () => {
    const years = [fy(2021, 1, 1, false, false), fy(2022, 1, 1), fy(2023, 1, 1, true, false)]
    expect(neighborhoodYears(years)).toEqual([2022])
    for (const y of years.filter((y) => !y.placeable)) expect(neighborhoodYears(years)).not.toContain(y.year)
  })
  it('the partial year never appears, even when placeable', () => {
    expect(neighborhoodYears(REAL_SHAPE)).not.toContain(2026)
  })
  it('ascending whatever the input order', () => {
    expect(neighborhoodYears([...REAL_SHAPE].reverse())).toEqual([2021, 2024, 2025])
  })
})

describe('latestFullYear — the third chip\'s year', () => {
  it('is the latest non-partial year, placeable or not', () => {
    expect(latestFullYear(REAL_SHAPE)?.year).toBe(2025)
    expect(latestFullYear([fy(2024, 1, 1), fy(2025, 1, 1, false, false), fy(2026, 1, 1, true)])?.year).toBe(2025)
  })
  it('null when no year is full', () => {
    expect(latestFullYear([fy(2026, 1, 1, true)])).toBeNull()
    expect(latestFullYear([])).toBeNull()
  })
})

describe('safetyRows', () => {
  const nb = (name: string, trees: number, falls: [number, number, number][]): NeighborhoodAggregate =>
    ({ name, trees, stumps: 3, largeTrunks: 40, population: 1, areaKm2: 1, medianIncome: 1, povertyRate: 1, perK: 1, perKm2: 1, flag: null, falls })
  const YEARS = [fy(2024, 1, 1), fy(2025, 1, 1)]
  const rows = safetyRows([nb('Mission', 9000, [[2025, 90, 10]]), nb('Lincoln Park', 11, [[2025, 5, 0]]), nb('Marina', 4000, [])], 2025, YEARS)
  it('sorts by that year\'s fallen-tree reports', () => {
    expect(rows.map((r) => r.name)).toEqual(['Mission', 'Lincoln Park', 'Marina'])
  })
  it('carries the street trees beside the reports as a plain figure, never a rate (R17)', () => {
    expect(rows.map((r) => [r.name, r.fallen, r.trees])).toEqual([['Mission', 90, 9000], ['Lincoln Park', 5, 11], ['Marina', 0, 4000]])
    for (const r of rows) expect(Object.keys(r)).not.toContain('per1kTrees')
  })
  it('within a readable year, a neighborhood with no row for it has 0 of each kind', () => {
    expect(rows[2]).toMatchObject({ fallen: 0, aboutToFall: 0 })
  })
  it('carries large trunks, stumps and the about-to-fall count apart', () => {
    expect(rows[0]).toMatchObject({ largeTrunks: 40, stumps: 3, fallen: 90, aboutToFall: 10 })
  })
  it('ties keep name order, so the list never reshuffles', () => {
    const tied = safetyRows([nb('Twin Peaks', 900, [[2025, 4, 0]]), nb('Bernal Heights', 900, [[2025, 4, 0]])], 2025, YEARS)
    expect(tied.map((r) => r.name)).toEqual(['Bernal Heights', 'Twin Peaks'])
  })
  it('reads only the asked year', () => {
    const r = safetyRows([nb('Mission', 9000, [[2024, 7, 1], [2025, 90, 10]])], 2024, YEARS)
    expect(r[0]).toMatchObject({ fallen: 7, aboutToFall: 1 })
  })
  it('a year neighborhood counts cannot be read for returns NO rows, never a list of zeros', () => {
    const nbs = [nb('Mission', 9000, [[2021, 5, 1], [2024, 7, 1], [2025, 90, 10], [2026, 3, 0]]), nb('Marina', 4000, [])]
    // unplaceable (2022, 2023), partial (2026), and absent (2019) years
    for (const y of [2019, 2022, 2023, 2026]) expect(safetyRows(nbs, y, REAL_SHAPE), String(y)).toEqual([])
    // every year neighborhoodYears offers does return rows
    for (const y of neighborhoodYears(REAL_SHAPE)) expect(safetyRows(nbs, y, REAL_SHAPE), String(y)).toHaveLength(2)
  })
})

describe('safety lines', () => {
  it('names the years left out and why, from the data', () => {
    expect(phrase.yearsLeftOutLine(REAL_SHAPE)).toBe(
      'Neighborhood counts leave out 2022 and 2023, when fewer than 75% of reports carry a map point, and 2026, which is not over.',
    )
    expect(phrase.yearsLeftOutLine([fy(2024, 1, 1), fy(2025, 1, 1, false, false)])).toBe(
      'Neighborhood counts leave out 2025, when fewer than 75% of reports carry a map point.',
    )
    expect(phrase.yearsLeftOutLine([fy(2025, 1, 1), fy(2026, 1, 1, true)])).toBe(
      'Neighborhood counts leave out 2026, which is not over.',
    )
    expect(phrase.yearsLeftOutLine([fy(2024, 1, 1), fy(2025, 1, 1)])).toBeNull()
  })
  it('a bar takes "so far" when partial, "citywide only" when unplaceable — both when both (S4)', () => {
    expect(phrase.fallBarCaptions({ partial: true, placeable: true })).toEqual(['so far'])
    expect(phrase.fallBarCaptions({ partial: false, placeable: false })).toEqual(['citywide only'])
    expect(phrase.fallBarCaptions({ partial: true, placeable: false })).toEqual(['so far', 'citywide only'])
    expect(phrase.fallBarCaptions({ partial: false, placeable: true })).toEqual([])
  })
  it('the list head names both figures, no rate, and says rows count only mapped reports (R17, S3)', () => {
    expect([phrase.ROWS_COUNT_HEAD, phrase.ROWS_TREES_HEAD]).toEqual(['Reports', 'Street trees'])
    expect((phrase as Record<string, unknown>).PER_1K_UNIT).toBeUndefined()
    expect((phrase as Record<string, unknown>).rateWithheldTip).toBeUndefined()
    expect(phrase.ROWS_MAPPED_ONLY).toBe('Rows count only reports with a map point, so a year’s rows can add up to less than its bar above.')
  })
  it('a partial year that also cannot be placed is named once, for the map point', () => {
    expect(phrase.yearsLeftOutLine([fy(2025, 1, 1), fy(2026, 1, 1, true, false)])).toBe(
      'Neighborhood counts leave out 2026, when fewer than 75% of reports carry a map point.',
    )
  })
  it('each bar\'s sentence names both kinds and never sums them', () => {
    const [b2022, , b2026] = fallBars([fy(2022, 621, 192, false, false), fy(2023, 4390, 436), fy(2026, 889, 582, true)])
    expect(phrase.fallBarLabel(b2022)).toBe(
      '2022: 621 fallen-tree reports, 192 about-to-fall reports. Citywide only: too few of these reports carry a map point to count by neighborhood.',
    )
    expect(phrase.fallBarLabel(b2026)).toBe('2026 so far: 889 fallen-tree reports, 582 about-to-fall reports.')
    expect(phrase.fallBarLabel(fallBars([fy(2023, 1, 1)])[0])).toBe('2023: 1 fallen-tree report, 1 about-to-fall report.')
  })
  it('the busiest day is a citywide figure', () => {
    expect(phrase.busiestDayLine({ ymd: '2023-03-21', reports: 467 }, 2026)).toBe(
      'The busiest single day was March 21, 2023, with 467 fall reports citywide, counting fallen-tree and about-to-fall reports together.',
    )
  })
  it('the third chip names its year', () => {
    expect(phrase.fallChipCaption(2025)).toBe('Fallen-tree reports, 2025')
    expect(phrase.fallChipTip(2025, 1592, 752)).toBe(
      'In 2025, 311 logged 1,592 reports of a fallen tree and 752 of a tree about to fall, not counting reports the city closed as duplicates.',
    )
  })
  it('a row\'s sentence: reports, street trees beside them (never divided), trunks and stumps', () => {
    const [row] = safetyRows([{
      name: 'Mission', trees: 9000, stumps: 3, largeTrunks: 40, population: 1, areaKm2: 1, medianIncome: 1, povertyRate: 1,
      perK: 1, perKm2: 1, flag: null, falls: [[2025, 90, 10]],
    }], 2025, [fy(2025, 1, 1)])
    expect(phrase.safetyRowLabel(row, 2025)).toBe(
      'Mission: 90 fallen-tree reports and 10 about-to-fall reports in 2025. ' +
        '9,000 street trees in the inventory today, 40 with a recorded trunk 21 inches or wider; 3 stumps.',
    )
    expect(phrase.safetyRowLabel({ ...row, name: 'Lincoln Park', trees: 1, fallen: 1, aboutToFall: 0, largeTrunks: 1, stumps: 1 }, 2025)).toBe(
      'Lincoln Park: 1 fallen-tree report and 0 about-to-fall reports in 2025. ' +
        '1 street tree in the inventory today, 1 with a recorded trunk 21 inches or wider; 1 stump.',
    )
    expect(phrase.safetyRowLabel(row, 2025)).not.toMatch(/per 1,000|rate/)
  })
  it('removal notices: a notice, never a removal', () => {
    expect(phrase.noticesListedLabel(4831, 5571)).toBe('4,831 of 5,571 sites with a removal notice are still in the inventory.')
    expect(phrase.noticeTypeLabel('Posted 24hr', 1354)).toBe('Posted 24hr: 1,354 removal notices')
    expect(phrase.noticeTypeLabel('Posted 24hr', 1)).toBe('Posted 24hr: 1 removal notice')
    expect(phrase.noticesTotalLine(5713, 2017, 5571, 3)).toBe(
      '5,713 removal notices posted since 2017 at 5,571 sites; 3 carry no readable site number. A site can hold more than one notice.')
    expect(phrase.noticesTotalLine(5713, null, 5571, 1)).toBe(
      '5,713 removal notices posted at 5,571 sites; 1 carries no readable site number. A site can hold more than one notice.')
    expect(phrase.noticesTotalLine(1, null, 1, 0)).toBe('1 removal notice posted at 1 site. A site can hold more than one notice.')
    expect(phrase.replantedAfterLine(1022)).toBe(
      'At 1,022 sites, the planting date now on record is later than the site’s removal notice, so that notice belongs to an earlier tree.',
    )
    expect(phrase.replantedAfterLine(1)).toBe(
      'At 1 site, the planting date now on record is later than the site’s removal notice, so that notice belongs to an earlier tree.',
    )
  })
  it('noticed sites still in the inventory: what they are listed as now (final review I2)', () => {
    expect(phrase.noticedKindsLine({ tree: 4368, stump: 136, site: 325, shrub: 2 })).toBe(
      'Of those, 4,368 are listed as a street tree, 136 as a stump, 325 as an empty planting site and 2 as a shrub.')
    expect(phrase.noticedKindsList({ tree: 4368, stump: 136, site: 325, shrub: 2 })).toBe(
      '4,368 listed as a street tree, 136 as a stump, 325 as an empty planting site and 2 as a shrub')
    expect(phrase.noticedKindsLine({ tree: 1, stump: 0, site: 2, shrub: 0 })).toBe(
      'Of those, 1 is listed as a street tree and 2 as an empty planting site.')
    expect(phrase.noticedKindsLine({ tree: 0, stump: 1, site: 0, shrub: 0 })).toBe('Of those, 1 is listed as a stump.')
    expect(phrase.noticedKindsLine({ tree: 0, stump: 0, site: 0, shrub: 0 })).toBeNull()
    expect(phrase.noticedKindsList({ tree: 0, stump: 0, site: 0, shrub: 0 })).toBeNull()
  })
})

// The scoring-word ban (dangerous / hazard / risk) runs over EVERY export of
// treesPhrase.ts, through the same samples as the jargon ban: treesPhrase.test.ts.
