// src/views/Trees/treesPhrase.test.ts
import { describe, expect, it } from 'vitest'
import type { DisappearedLog } from '@/lib/trees/types'
import * as phrase from './treesPhrase'
import {
  disappearedLine, equityFlagNote, equityLead, leftInventoryNote, nearbyFallsLine, noticeLine, speciesRankLine,
  topFiveLine,
} from './treesPhrase'

const c = (pkI: number, pkP: number, kmI: number, kmP: number) =>
  ({ n: 36, perK: { income: pkI, poverty: pkP }, perKm2: { income: kmI, poverty: kmP } })

describe('equityLead — says only what holds under BOTH measures', () => {
  it('strong per resident, weak per area (the Sept. 30, 2026 reading)', () => {
    expect(equityLead(c(0.65, -0.58, 0.33, -0.17))).toBe(
      'Higher-income neighborhoods have more street trees. The link is strong when trees are counted per resident and weak when counted per square kilometer.',
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
      'Higher-income neighborhoods have more street trees. The link is weak when trees are counted per resident and strong when counted per square kilometer.',
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
      // equityFlagNote — every value
      ...(['park', 'low-coverage', 'small-population', null] as const).map((f) => equityFlagNote(f) ?? ''),
      // leftInventoryNote — every kind
      ...(['tree', 'stump', 'site', 'shrub'] as const).map((k) => leftInventoryNote('2025-03-01', 2026, k)),
      // disappearedLine — no runs, one site, many sites
      disappearedLine(log([]), 2026), disappearedLine(log([1]), 2026), disappearedLine(log([1, 2, 3]), 2026),
      speciesRankLine(1, 639), topFiveLine(24.6),
      // noticeLine — both readings × the three types + an unknown type
      ...(['earlier-tree', 'this-site'] as const).flatMap((r) =>
        ['Posted 24hr', 'Posted 15 Day', 'Posted 30 Day', 'Other'].map((t) => noticeLine(r, '2018-02-27', t, 2026))),
      nearbyFallsLine(0, 2021), nearbyFallsLine(1, 2021), nearbyFallsLine(3, 2021),
      phrase.UNKNOWN_SITE,
    ]
    expect(out.length).toBeGreaterThan(30)
    for (const s of out) if (BANNED.test(s)) throw new Error(s)
  })
})
