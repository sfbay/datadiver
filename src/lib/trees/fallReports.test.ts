// src/lib/trees/fallReports.test.ts
import { describe, expect, it } from 'vitest'
import { FALL_WHERE, PLACEABLE_FLOOR, buildGrid, countWithin, fallKind, isCityDuplicate, isPlaced, placedShare } from './fallReports'

describe('fallKind — 311 changed its spelling in June 2024', () => {
  it('folds both eras', () => {
    expect(fallKind('Fallen_tree')).toBe('fallen')
    expect(fallKind('fallen_tree')).toBe('fallen')
    expect(fallKind('About_to_fall')).toBe('about-to-fall')
    expect(fallKind('about_to_fall')).toBe('about-to-fall')
  })
  it('nothing else is a fall report', () => {
    for (const v of ['Hanging_limb', '', null, undefined]) expect(fallKind(v), String(v)).toBeNull()
  })
})

describe('isCityDuplicate — the city\'s own mark, never our clustering', () => {
  it('matches both duplicate strings', () => {
    expect(isCityDuplicate('Case is a Duplicate')).toBe(true)
    expect(isCityDuplicate('Case is a Duplicate - Duplicate')).toBe(true)
  })
  it('resolved, open and blank are not duplicates', () => {
    for (const v of ['Case Resolved', 'open', '', null, undefined]) expect(isCityDuplicate(v), String(v)).toBe(false)
  })
})

describe('isPlaced — non-null is not valid', () => {
  it('phone reports arrive at 0,0', () => {
    expect(isPlaced('0.000000000000', '0.000000000000')).toBe(false)
    expect(isPlaced(null, null)).toBe(false)
  })
  it('a point in the city is placed', () => {
    expect(isPlaced('37.78896085', '-122.41905832')).toBe(true)
  })
})

describe('countWithin — 30 m, across grid cell edges', () => {
  const base = { lat: 37.78896, lon: -122.41906 }
  const north = (m: number) => ({ lat: base.lat + m / 111_320, lon: base.lon })
  const east = (m: number) => ({ lat: base.lat, lon: base.lon + m / (111_320 * Math.cos(base.lat * Math.PI / 180)) })
  const grid = buildGrid([north(10), north(29), north(31), east(25), east(60), base])
  it('counts only points within the radius', () => {
    expect(countWithin(grid, base.lat, base.lon)).toBe(4) // self, 10 m, 29 m, 25 m east
  })
  it('an empty neighbourhood counts zero', () => {
    expect(countWithin(grid, 37.70, -122.50)).toBe(0)
  })
})

describe('placeable years — ruling R1', () => {
  it('the floor is 75 percent', () => {
    expect(PLACEABLE_FLOOR).toBe(75)
  })
  it('placedShare is a one-decimal percent of the non-duplicates', () => {
    expect(placedShare(1000, 538)).toBe(46.2)
    expect(placedShare(3, 1)).toBe(66.7)
    expect(placedShare(4, 1)).toBe(75)
    expect(placedShare(0, 0)).toBe(100)
  })
})

it('FALL_WHERE names the service, both kinds case-folded, and the window', () => {
  expect(FALL_WHERE).toBe(
    "service_name='Tree Maintenance' AND lower(service_details) in('fallen_tree','about_to_fall') AND requested_datetime >= '2021-01-01'",
  )
})
