// src/views/Restaurants/restaurantQueries.test.ts
//
// Pins the two rules every live query obeys: the today clamp, and inspectors
// shown-never-ranked (§11 replaced the old "grep for inspector" test with
// this one: no query GROUPs BY, orders by, or filters on `inspector`).
// Every builder ran live against data.sf.gov on 2026-09-24 and returned rows
// (Q1 since → 59 / 88 / 2,602; before → 227 / 393 / 6,242).

import { describe, it, expect } from 'vitest'
import type { SoQLParams } from '@/api/client'
import {
  todayClamp,
  windowClause,
  cardsQuery,
  neighborhoodRatesQuery,
  mapPermitsQuery,
  nonPassReadingsQuery,
  storefrontLaneQuery,
  dataEdgeQuery,
  MAP_PERMIT_LIMIT,
  NON_PASS_LIMIT,
} from './restaurantQueries'
import { FOOD_WHERE, STOREFRONT_WHERE } from './foodPermits'
import { feedWindow } from './inspectionFeed'

const T = '2026-09-24'
const since = feedWindow('since', T)
const before = feedWindow('before', T)

const ALL: Array<[string, SoQLParams]> = [
  ['Q1 since', cardsQuery(since, T)],
  ['Q1 before', cardsQuery(before, T)],
  ['Q1 neighborhood', cardsQuery(since, T, 'Mission')],
  ['Q2', neighborhoodRatesQuery(since, T)],
  ['Q3a', mapPermitsQuery(since, T)],
  ['Q3b', nonPassReadingsQuery(since, T)],
  ['Q4', storefrontLaneQuery(['31974', '103413'], T)],
  ['Q4 empty', storefrontLaneQuery([], T)],
  ['Q5', dataEdgeQuery(T)],
]

describe('restaurantQueries', () => {
  it('EVERY builder carries the today clamp', () => {
    for (const [name, p] of ALL) expect(p.$where, name).toContain(`inspection_date <= '${T}'`)
    expect(todayClamp(T)).toBe(`inspection_date <= '${T}'`)
  })

  it('no builder groups, orders or filters by inspector (shown, never ranked)', () => {
    for (const [name, p] of ALL) {
      expect(p.$group ?? '', name).not.toMatch(/inspector/i)
      expect(p.$order ?? '', name).not.toMatch(/inspector/i)
      expect(p.$where ?? '', name).not.toMatch(/inspector/i)
      expect(p.$having ?? '', name).not.toMatch(/inspector/i)
      // Only Q4 selects it, and only as a plain column — never inside an aggregate.
      if (!name.startsWith('Q4')) expect(p.$select ?? '', name).not.toMatch(/inspector/i)
      expect(p.$select ?? '', name).not.toMatch(/\(\s*[^)]*inspector/i)
    }
  })

  it('Q4 selects inspector (§11) with the lane fields, oldest first', () => {
    const q4 = storefrontLaneQuery(['31974', '31974', ''], T)
    expect(q4.$select!.split(',').map((s) => s.trim())).toEqual([
      'inspection_date',
      'permit_number',
      'permit_type',
      'dba',
      'inspection_type',
      'facility_rating_status',
      'violation_count',
      'violation_codes',
      'inspector',
    ])
    expect(q4.$where).toBe(`permit_number IN ('31974') AND inspection_date <= '${T}'`)
    expect(q4.$order).toBe('inspection_date, permit_number')
  })

  it('an empty permit list matches nothing, never everything', () => {
    expect(storefrontLaneQuery([], T).$where).toMatch(/^1 = 0 AND /)
  })

  it('windows clamp their end to today and never pass the break', () => {
    expect(windowClause(since, T)).toBe(
      `inspection_date BETWEEN '2025-09-01' AND '2026-08-31' AND inspection_date <= '${T}'`,
    )
    expect(windowClause({ start: '2025-09-01', end: '2026-08-31' }, '2026-08-15')).toContain(
      "BETWEEN '2025-09-01' AND '2026-08-15'",
    )
    expect(cardsQuery(before, T).$where).toContain("BETWEEN '2024-07-01' AND '2025-06-30'")
  })

  it('cards + rates count FOOD permits; the map reads STOREFRONT permits only', () => {
    expect(cardsQuery(since, T).$where!.startsWith(FOOD_WHERE)).toBe(true)
    expect(neighborhoodRatesQuery(since, T).$where!.startsWith(FOOD_WHERE)).toBe(true)
    expect(mapPermitsQuery(since, T).$where!.startsWith(STOREFRONT_WHERE)).toBe(true)
    expect(nonPassReadingsQuery(since, T).$where!.startsWith(STOREFRONT_WHERE)).toBe(true)
  })

  it('cards count PLACES (distinct permits), and a neighborhood is one quoted clause', () => {
    const q1 = cardsQuery(since, T)
    expect(q1.$select).toContain('count(distinct permit_number) AS inspected')
    expect(q1.$select).toContain("count(distinct case(facility_rating_status='Closure', permit_number)) AS closed")
    expect(q1.$select).not.toMatch(/count\(\*\)/)
    expect(cardsQuery(since, T, "O'Farrell").$where).toMatch(/AND analysis_neighborhood = 'O''Farrell'$/)
    expect(neighborhoodRatesQuery(since, T).$group).toBe('analysis_neighborhood')
  })

  it('map queries are complete, not sampled', () => {
    const q3a = mapPermitsQuery(since, T)
    expect(q3a.$group).toBe('permit_number')
    expect(q3a.$limit).toBe(MAP_PERMIT_LIMIT)
    expect(q3a.$where).toContain('facility_rating_status IS NOT NULL')
    const q3b = nonPassReadingsQuery(since, T)
    expect(q3b.$where).toContain("facility_rating_status IN ('Closure','Conditional Pass')")
    expect(q3b.$limit).toBe(NON_PASS_LIMIT)
  })

  it('Q5 is the clamped MAX — the unclamped one returns the 2031 junk row', () => {
    expect(dataEdgeQuery(T)).toEqual({ $select: 'max(inspection_date) AS edge', $where: `inspection_date <= '${T}'`, $limit: 1 })
  })
})
