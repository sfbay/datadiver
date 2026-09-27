import { describe, it, expect, vi } from 'vitest'

// The hook's React/fetch side never loads under node — only its pure exports are tested.
vi.mock('@/hooks/useDataset', () => ({ useDataset: () => ({ data: [], isLoading: false, error: null, hitLimit: false, refetch: () => {} }) }))

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  toFigures, toRates, toMapReadings, closuresInWindow, closedPermitsQuery, permitReadingsQuery,
  mapPermitsWithPassQuery, MIN_RATED, neighborhoodCardFigures,
} from './useRestaurantData'
import { feedWindow } from './inspectionFeed'

const T = '2026-09-24'
const D = 'T00:00:00.000'

describe('neighborhood card figures — a failed read is never zeros', () => {
  const rates = toRates([{ analysis_neighborhood: 'Mission', closed: '37', yellow: '40', inspected: '822' }])
  it('reads the neighborhood’s Q2 row, zeros only when the window truly has no row', () => {
    expect(neighborhoodCardFigures('Mission', rates, { ready: true, error: null })).toEqual({ closed: 37, yellow: 40, inspected: 822 })
    expect(neighborhoodCardFigures('Seacliff', rates, { ready: true, error: null })).toEqual({ closed: 0, yellow: 0, inspected: 0 })
  })
  it('null — never zeros — while loading, with no selection, or when Q2 FAILED', () => {
    expect(neighborhoodCardFigures('Mission', rates, { ready: false, error: null })).toBeNull()
    expect(neighborhoodCardFigures(null, rates, { ready: true, error: null })).toBeNull()
    expect(neighborhoodCardFigures('Mission', [], { ready: true, error: 'Request failed (500)' })).toBeNull()
  })
  it('the hook ignores a failed query’s rows (useDataset keeps the previous window’s data on error)', () => {
    const src = readFileSync(fileURLToPath(new URL('./useRestaurantData.ts', import.meta.url)), 'utf8')
    expect(src).toMatch(/q\.error \? NO_ROWS : q\.data/)
    for (const q of ['permitsQ', 'nonPassQ', 'ratesQ', 'closedQ', 'readingsQ']) expect(src).toContain(`rowsOf(${q})`)
  })
})

describe('figures + rates', () => {
  it('parses Q1 (Socrata sends strings)', () => {
    expect(toFigures({ closed: '59', yellow: '88', inspected: '2602' })).toEqual({ closed: 59, yellow: 88, inspected: 2602 })
    expect(toFigures(undefined)).toBeNull()
  })

  it('rates closed ÷ inspected; below MIN_RATED keeps counts, no share; the unplaced group is kept unrated', () => {
    const rates = toRates([
      { analysis_neighborhood: 'Mission', closed: '37', yellow: '40', inspected: '822' },
      { analysis_neighborhood: 'Seacliff', closed: '1', yellow: '0', inspected: String(MIN_RATED - 1) },
      { closed: '2', yellow: '0', inspected: '81' },
    ])
    expect(rates[0].closedShare).toBeCloseTo(37 / 822)
    expect(rates[1]).toMatchObject({ nhood: 'Seacliff', closed: 1, closedShare: null, yellowShare: null })
    expect(rates[2]).toMatchObject({ nhood: '', inspected: 81, closedShare: null })
    // a sum over rows reaches the citywide figure
    expect(rates.reduce((s, r) => s + r.inspected, 0)).toBe(822 + MIN_RATED - 1 + 81)
  })
})

describe('map readings', () => {
  const permits = [
    { permit_number: 'a', dba: 'GOLDEN FLOWER', addr: '667   JACKSON ST', lat: '37.796', lng: '-122.406', last_date: `2025-10-01${D}` },
    { permit_number: 'b', dba: 'TONYS', addr: '1 WARRIORS WAY', lat: '37.768', lng: '-122.388', last_date: `2025-10-01${D}` },
    { permit_number: 'c', dba: 'NOWHERE', addr: '1 MAIN ST', lat: '0', lng: '0', last_date: `2025-10-01${D}` },
    { permit_number: 'd', dba: 'CLEAN', addr: '2 MAIN ST', lat: '37.79', lng: '-122.40', last_date: `2025-10-01${D}`, last_pass: `2025-10-01${D}` },
  ]
  const nonPass = [{ permit_number: 'a', inspection_date: `2025-10-01${D}`, facility_rating_status: 'Closure' }]

  it('drops venue doors and off-map coordinates, and resolves the latest reading', () => {
    const rows = toMapReadings(permits, nonPass, null)
    expect(rows.map((r) => r.permit)).toEqual(['a', 'd'])
    expect(rows[0]).toMatchObject({ name: 'Golden Flower', address: '667 Jackson St', latest: 'closure', lastDate: '2025-10-01' })
    expect(rows[1].latest).toBe('pass')
  })

  it('applies the card filter', () => {
    expect(toMapReadings(permits, nonPass, 'closure').map((r) => r.permit)).toEqual(['a'])
    expect(toMapReadings(permits, nonPass, 'conditional')).toEqual([])
  })
})

describe('every closure, newest first', () => {
  const w = feedWindow('before', T) // 2024-07-01 … 2025-06-30
  const permits = [
    { permit_number: '31974', dba: 'GOLDEN FLOWER', addr: '667 JACKSON ST', nhood: 'Chinatown' },
    { permit_number: '2', dba: 'SAME DAY CAFE', addr: '1 A ST', nhood: 'Mission' },
  ]
  const r = (p: string, date: string, s: string) => ({ permit_number: p, inspection_date: `${date}${D}`, facility_rating_status: s })

  it('runs THE episode rule over full history: four Closure rows are one closure (Golden Flower)', () => {
    const list = closuresInWindow(
      permits,
      [
        r('31974', '2024-07-15', 'Closure'), r('31974', '2024-07-18', 'Closure'),
        r('31974', '2024-07-22', 'Closure'), r('31974', '2024-07-29', 'Closure'),
        r('31974', '2024-08-01', 'Pass'),
        r('2', '2025-03-05', 'Closure'), r('2', '2025-03-05', 'Pass'),
        // outside the window — not listed
        r('2', '2025-09-10', 'Closure'), r('2', '2025-09-12', 'Pass'),
      ],
      w, T,
    )
    expect(list.map((i) => [i.permit, i.start])).toEqual([['2', '2025-03-05'], ['31974', '2024-07-15']])
    expect(list[1]).toMatchObject({ name: 'Golden Flower', closureVisits: 4, clearedOn: '2024-08-01', days: 17, nhood: 'Chinatown' })
    expect(list[0]).toMatchObject({ sameDay: true, days: null })
  })

  it('keeps an episode that began before the window with its true start', () => {
    const list = closuresInWindow(permits, [r('31974', '2024-06-28', 'Closure'), r('31974', '2024-07-02', 'Closure')], w, T)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ start: '2024-06-28', clearedOn: null })
  })
})

describe('query shape', () => {
  const w = feedWindow('since', T)
  it('the closures list shares the "Places closed" card scope and the today clamp', () => {
    const q = closedPermitsQuery(w, T)
    expect(q.$where).toContain("facility_rating_status = 'Closure'")
    expect(q.$where).toContain(`inspection_date <= '${T}'`)
    expect(q.$where).toContain('permit_type IN (')
  })
  it('an empty permit list matches nothing, never everything', () => {
    expect(permitReadingsQuery([], T).$where).toMatch(/^1 = 0 /)
  })
  it('Q3a gains the latest Pass date so a same-day closure + pass reads Pass', () => {
    expect(mapPermitsWithPassQuery(w, T).$select).toContain("max(case(facility_rating_status='Pass', inspection_date)) AS last_pass")
  })
  it('no query groups, orders or filters by inspector (§11: shown, never ranked)', () => {
    const src = readFileSync(fileURLToPath(new URL('./useRestaurantData.ts', import.meta.url)), 'utf8')
    const queries = [closedPermitsQuery(w, T), permitReadingsQuery(['1'], T), mapPermitsWithPassQuery(w, T)]
    for (const q of queries) {
      expect(JSON.stringify([q.$where, (q as { $group?: string }).$group, q.$order])).not.toMatch(/inspector/i)
    }
    expect(src).not.toMatch(/\$(group|order|where)[^\n]*inspector/)
  })
})
