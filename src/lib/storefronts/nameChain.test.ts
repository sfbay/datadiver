import { describe, expect, it } from 'vitest'
import {
  cleanOperatorName,
  daysBetween,
  groupOperators,
  isMultiTenant,
  isStrictOperator,
  longestChain,
  meetsTurnoverBar,
  sameOperator,
  sequenceRatio,
  turnoverBucket,
  turnoverExclusion,
  type Sighting,
} from './nameChain'

// Sightings are the real inspection names + dates at each door (pyih-qa8i /
// 5tti-66ds / tvy3-wexg, research scratch 2026-09-24).

const HAYES_2077: Sighting[] = [
  { name: 'Katani Pizza', date: '2016-11-09', era: 2016 },
  { name: 'Katani Pizza', date: '2017-03-27', era: 2016 },
  { name: 'Katani Pizza', date: '2018-08-21', era: 2016 },
  { name: 'HAYES PIZZA', date: '2021-03-09', era: 2020 },
  { name: 'HAYES PIZZA', date: '2022-09-06', era: 2020 },
  { name: 'THE HUNGRY SPOT', date: '2024-03-14', era: 2024 },
  { name: 'THE HUNGRY SPOT', date: '2024-04-25', era: 2024 },
  { name: 'THE HUNGRY SPOT', date: '2025-01-08', era: 2024 },
]

const TWENTY_FOURTH_2704: Sighting[] = [
  { name: 'Almanac San Francisco', date: '2016-12-07', era: 2016 },
  { name: 'Almanac San Francisco', date: '2017-06-20', era: 2016 },
  { name: 'Almanac San Francisco', date: '2017-12-01', era: 2016 },
  { name: 'SEVEN STILLS', date: '2019-07-19', era: 2016 },
  { name: 'BREWVINO SF', date: '2021-04-09', era: 2020 },
  { name: 'BREWVINO SF', date: '2021-09-09', era: 2020 },
  { name: 'AYAHUAZKA RESTAURANT', date: '2024-01-10', era: 2024 },
  { name: 'CAPRIZZA RISTORANTE', date: '2024-05-31', era: 2024 },
  { name: 'CAPRIZZA RISTORANTE', date: '2025-02-04', era: 2024 },
  { name: 'TBD', date: '2024-02-01', era: 2024 }, // synthetic: a DPH placeholder name
]

describe('daysBetween', () => {
  it('counts calendar days, across DST and leap years', () => {
    expect(daysBetween('2024-03-09', '2024-03-11')).toBe(2)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2024-08-01', '2024-07-15')).toBe(-17)
  })
})

describe('sequenceRatio — Python difflib parity', () => {
  it('matches SequenceMatcher(None, a, b).ratio()', () => {
    expect(sequenceRatio('abcd', 'bcde')).toBeCloseTo(0.75, 12)
    expect(sequenceRatio('private', 'privet')).toBeCloseTo(0.7692307692307693, 12)
    expect(sequenceRatio('KATANI PIZZA', 'GOCHEES PIZZA KATANI PIZZA')).toBeCloseTo(0.631578947368421, 12)
    expect(sequenceRatio('CHUBBY NOODLE', 'CHUBBY NOODLES')).toBeCloseTo(0.9629629629629629, 12)
    expect(sequenceRatio('SEVEN STILLS', 'BREWVINO')).toBeCloseTo(0.3, 12)
    expect(sequenceRatio('', '')).toBe(1)
  })
})

describe('cleanOperatorName / sameOperator (rule 5)', () => {
  it('drops legal forms, CAFE/RESTAURANT, PLAN CHECK and DBA prefixes', () => {
    expect(cleanOperatorName("Pete's on Green")).toBe('PETES ON GREEN')
    expect(cleanOperatorName('THE HUNGRY SPOT')).toBe('HUNGRY SPOT')
    expect(cleanOperatorName('AYAHUAZKA RESTAURANT')).toBe('AYAHUAZKA')
    expect(cleanOperatorName('PLAN CHECK - SUPER DUPER BURGERS')).toBe('SUPER DUPER BURGERS')
    expect(cleanOperatorName('DBA: Chubby Noodle LLC')).toBe('CHUBBY NOODLE')
    expect(cleanOperatorName('DBABBLE CAFE')).toBe('DBABBLE')
  })

  it('names nobody for DPH placeholders', () => {
    expect(cleanOperatorName('TBD')).toBe('')
    expect(cleanOperatorName('New Owner')).toBe('')
    expect(cleanOperatorName('The Restaurant')).toBe('')
  })

  it('folds spellings of one operator and keeps different ones apart', () => {
    expect(sameOperator('CHUBBY NOODLE', 'CHUBBY NOODLES')).toBe(true) // prefix / ≥85%
    expect(sameOperator('GOCHEES PIZZA KATANI PIZZA', 'KATANI PIZZA')).toBe(true) // ≥67% of shorter's words
    expect(sameOperator('ALMANAC', 'ALMANAC BEER')).toBe(true)
    expect(sameOperator('SUPERDUPER', 'SUPER DUPER')).toBe(true) // shared 6-char stem, spaces removed
    expect(sameOperator('SEVEN STILLS', 'BREWVINO')).toBe(false)
    expect(sameOperator('HAYES PIZZA', 'HUNGRY SPOT')).toBe(false)
  })
})

describe('groupOperators', () => {
  it('turns 2077 Hayes St sightings into three operators, oldest first', () => {
    const ops = groupOperators(HAYES_2077)
    expect(ops.map((o) => o.name)).toEqual(['Katani Pizza', 'HAYES PIZZA', 'THE HUNGRY SPOT'])
    expect(ops[0]).toMatchObject({ firstDate: '2016-11-09', lastDate: '2018-08-21', eras: [2016], seenOnce: false })
    expect(ops[0].dateList).toHaveLength(3)
  })

  it('drops placeholder sightings and marks one-timers', () => {
    const ops = groupOperators(TWENTY_FOURTH_2704)
    expect(ops.map((o) => o.name)).toEqual([
      'Almanac San Francisco', 'SEVEN STILLS', 'BREWVINO SF', 'AYAHUAZKA RESTAURANT', 'CAPRIZZA RISTORANTE',
    ])
    expect(ops.filter((o) => o.seenOnce).map((o) => o.name)).toEqual(['SEVEN STILLS', 'AYAHUAZKA RESTAURANT'])
  })

  it('does not depend on input order', () => {
    expect(groupOperators([...HAYES_2077].reverse())).toEqual(groupOperators(HAYES_2077))
  })

  it('counts a same-day duplicate once', () => {
    const ops = groupOperators([
      { name: 'Yarsa', date: '2025-06-25', era: 2024 },
      { name: 'YARSA', date: '2025-06-25T00:00:00.000', era: 2024 },
    ])
    expect(ops).toHaveLength(1)
    expect(ops[0].dateList).toEqual(['2025-06-25'])
    expect(ops[0].seenOnce).toBe(true)
  })
})

describe('isMultiTenant (rule 2)', () => {
  const op = (name: string, dates: string[]) => groupOperators(dates.map((date) => ({ name, date, era: 2024 as const })))[0]

  it('a clean succession is single-tenant', () => {
    expect(isMultiTenant(groupOperators(HAYES_2077))).toBe(false)
  })

  it('flags three operators open at once', () => {
    const ops = [
      op('Alpha Tacos', ['2024-01-01', '2024-12-01']),
      op('Bravo Sushi', ['2024-02-01', '2024-11-01']),
      op('Charlie Pho', ['2024-03-01', '2024-10-01']),
    ]
    expect(isMultiTenant(ops)).toBe(true)
  })

  it('flags three operators inspected on one day', () => {
    const ops = [op('Alpha Tacos', ['2024-05-01']), op('Bravo Sushi', ['2024-05-01']), op('Charlie Pho', ['2024-05-01'])]
    expect(isMultiTenant(ops)).toBe(true)
  })

  it('flags two operators inspected together on two different days', () => {
    const two = [op('Alpha Tacos', ['2024-05-01', '2024-06-01']), op('Bravo Sushi', ['2024-05-01', '2024-06-01'])]
    expect(isMultiTenant(two)).toBe(true)
    const once = [op('Alpha Tacos', ['2024-05-01', '2024-06-01']), op('Bravo Sushi', ['2024-05-01', '2024-09-01'])]
    expect(isMultiTenant(once)).toBe(false)
  })
})

describe('turnoverExclusion (rules 1–4)', () => {
  it('passes an ordinary storefront', () => {
    expect(turnoverExclusion({ key: '2077 HAYES ST', multiTenant: false, nonStorefrontShare: 0 })).toBeNull()
  })

  it('names the first rule that excludes a door', () => {
    expect(turnoverExclusion({ key: 'OFF THE GRID', multiTenant: true, nonStorefrontShare: 1 })).toBe('not-storefront')
    expect(turnoverExclusion({ key: '2948 FOLSOM ST', multiTenant: false, nonStorefrontShare: 0 })).toBe('venue')
    expect(turnoverExclusion({ key: '100 MAIN ST', multiTenant: true, nonStorefrontShare: 0 })).toBe('multi-tenant')
    expect(turnoverExclusion({ key: '100 MAIN ST', multiTenant: false, nonStorefrontShare: 0.5 })).toBe('non-storefront-permits')
    expect(turnoverExclusion({ key: '100 MAIN ST', multiTenant: false, nonStorefrontShare: null })).toBeNull()
  })
})

describe('longestChain / ghost rule / bar (rules 5–7)', () => {
  it('builds the no-overlap succession with 60 days of slack', () => {
    const ops = [
      { id: 'a', firstDate: '2016-01-01', lastDate: '2018-06-01' },
      { id: 'b', firstDate: '2018-04-15', lastDate: '2020-01-01' }, // 47 days of overlap: within slack
      { id: 'c', firstDate: '2019-06-01', lastDate: '2019-09-01' }, // nested inside b
      { id: 'd', firstDate: '2021-01-01', lastDate: '2024-01-01' },
    ]
    // b and c cannot both be in the succession; greedy-by-end keeps the one
    // that ends first — the count (3) is what the rule optimizes.
    expect(longestChain(ops).map((o) => o.id)).toEqual(['a', 'c', 'd'])
    expect(longestChain([...ops].reverse()).map((o) => o.id)).toEqual(['a', 'c', 'd'])
    expect(longestChain(ops.filter((o) => o.id !== 'c')).map((o) => o.id)).toEqual(['a', 'b', 'd'])
  })

  it('refuses a successor that overlaps its predecessor by 60+ days', () => {
    const ops = [
      { id: 'a', firstDate: '2016-01-01', lastDate: '2018-06-01' },
      { id: 'b', firstDate: '2018-04-01', lastDate: '2020-01-01' }, // 61 days of overlap
    ]
    expect(longestChain(ops)).toHaveLength(1)
  })

  it('counts a one-inspection operator as strict only with 90+ days of registry tenure (E T9)', () => {
    expect(isStrictOperator({ dateList: ['2019-07-19'] }, null)).toBe(false)
    expect(isStrictOperator({ dateList: ['2019-07-19'] }, 89)).toBe(false)
    expect(isStrictOperator({ dateList: ['2019-07-19'] }, 90)).toBe(true)
    expect(isStrictOperator({ dateList: ['2021-04-09', '2021-09-09'] }, null)).toBe(true)
  })

  it('2704 24th St: five names seen, three on 2+ dates (voice sample 1)', () => {
    const ops = groupOperators(TWENTY_FOURTH_2704)
    expect(longestChain(ops)).toHaveLength(5)
    const byDatesOnly = ops.filter((o) => isStrictOperator(o, null))
    expect(longestChain(byDatesOnly).map((o) => o.name)).toEqual([
      'Almanac San Francisco', 'BREWVINO SF', 'CAPRIZZA RISTORANTE',
    ])
  })

  it('the bar needs a strict chain of 3 across 2+ eras', () => {
    const ops = groupOperators(HAYES_2077)
    expect(meetsTurnoverBar(ops)).toBe(true)
    expect(meetsTurnoverBar(ops.slice(0, 2))).toBe(false)
    const oneEra = groupOperators([
      { name: 'Alpha Tacos', date: '2024-01-01', era: 2024 },
      { name: 'Bravo Sushi', date: '2024-06-01', era: 2024 },
      { name: 'Charlie Pho', date: '2025-01-01', era: 2024 },
    ])
    expect(meetsTurnoverBar(oneEra)).toBe(false)
  })
})

describe('turnoverBucket (rule 8)', () => {
  it('2077 Hayes St: the owner came back — never "same owner"', () => {
    expect(turnoverBucket(['RED SMART', 'JMC FOODS', 'RED SMART'])).toBe('owner-returned')
    // …even when a rebrand also happened along the way
    expect(turnoverBucket(['RED SMART', 'RED SMART', 'JMC FOODS', 'RED SMART'])).toBe('owner-returned')
  })

  it("570 Green St: one company behind the first three names", () => {
    expect(turnoverBucket(['PETES ON GREEN', 'PETES ON GREEN', 'PETES ON GREEN', 'AGUILAR MARCO', 'A Z HOSPITALITY OF SAN FRANCISCO']))
      .toBe('same-owner')
  })

  it('three owners, each name its own', () => {
    expect(turnoverBucket(['ALMANAC BEER', 'BREW VINO', 'MAYAHS'])).toBe('three-owners')
  })

  it('skips unresolved operators', () => {
    expect(turnoverBucket(['A', null, 'A'])).toBe('same-owner')
    expect(turnoverBucket(['A', null, 'B', null, 'C'])).toBe('three-owners')
  })

  it('owners-unknown when the registry cannot vouch for the parade', () => {
    expect(turnoverBucket([null, null, 'A'])).toBe('owners-unknown')
    expect(turnoverBucket([])).toBe('owners-unknown')
    expect(turnoverBucket(['A', null, 'B'])).toBe('owners-unknown') // two owners, the third unknown
  })
})
