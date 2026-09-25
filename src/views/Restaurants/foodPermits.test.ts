// src/views/Restaurants/foodPermits.test.ts
//
// Pins the positive, exhaustive permit classification against the vocabulary
// probed live on data.sf.gov (2026-09-24):
//   SELECT permit_type, count(*) GROUP BY permit_type   (tvy3-wexg)
// A string DPH adds later is NOT in this fixture — it stays unclassified and
// excluded until someone classifies it (generator gate G0 catches it live).

import { describe, it, expect } from 'vitest'
import {
  PERMIT_CLASS,
  FOOD_PERMIT_TYPES,
  STOREFRONT_PERMIT_TYPES,
  NON_FOOD_PERMIT_TYPES,
  FOOD_WHERE,
  STOREFRONT_WHERE,
  classifyPermit,
  isFoodPermit,
  isStorefrontPermit,
  unclassifiedPermitTypes,
} from './foodPermits'

/** [permit_type, rows] — the live GROUP BY, 108 strings, 22,620 rows. */
const PROBED: ReadonlyArray<readonly [string, number]> = [
  ['H03 - RETAIL MKTS W/O PREP (UNDER 5001)', 1126],
  ['H03R - RETAIL MKTS W/O PREP (UNDER 5001)', 76],
  ['H04 - RETAIL MKTS W/O PREP (5001 - 10000)', 71],
  ['H04R - RETAIL MKTS W/O PREP (5001 - 10000)', 2],
  ['H05 - RETAIL MKTS W/O PREP (10001 - 20000)', 65],
  ['H05R - RETAIL MKTS W/O PREP (10001 - 20000)', 6],
  ['H06 - RETAIL MKTS W/O PREP (OVER 20000)', 31],
  ['H06R - RETAIL MKTS W/O PREP (OVER 20000)', 2],
  ['H07 - RETAIL MKTS W/FOOD PREP (UNDER 5001)', 1015],
  ['H07R - RETAIL MKTS W/FOOD PREP (UNDER 5001)', 87],
  ['H08 - RETAIL MKTS W/FOOD PREP (10001 - 20000)', 106],
  ['H08R - RETAIL MKTS W/FOOD PREP (10001 - 20000)', 8],
  ['H09 - RETAIL MKTS W/FOOD PREP (5001 - 10000)', 75],
  ['H09R - RETAIL MKTS W/FOOD PREP (5001 - 10000)', 7],
  ['H15 - WHOLESALE FOOD MARKETS', 3],
  ['H15R - WHOLESALE FOOD MARKETS', 3],
  ['H18 - WHOLESALE FOOD MARKETS', 1],
  ['H21 - WHOLESALE FOOD MARKETS', 17],
  ['H21R - WHOLESALE FOOD MARKETS', 6],
  ['H22 - FOOD MANUFACTURING/PROCESSING', 2],
  ['H22R - FOOD MANUFACTURING/PROCESSING', 1],
  ['H23 - FOOD PREP AND SERVICE (FEE EXEMPT)', 179],
  ['H23R- FOOD PREP AND SERVICE (FEE EXEMPT)', 15],
  ['H24 - RESTAURANT UNDER 1,000 SQFT', 3843],
  ['H24R - RESTAURANT UNDER 1,000 SQFT', 328],
  ['H25 - RESTAURANT 1,000 - 2,000 SQFT', 4762],
  ['H25R - RESTAURANT 1,000 - 2,000 SQFT', 412],
  ['H26 - RESTAURANT OVER 2,000 SQFT', 3681],
  ['H26R - RESTAURANT OVER 2,000 SQFT', 373],
  ['H28 - TAKE-OUTS', 432],
  ['H28R - TAKE-OUTS', 29],
  ['H29 - FAST FOOD OUTLETS', 74],
  ['H29R - FAST FOOD OUTLETS', 5],
  ['H80 - SUPERMARKETS W/2-3 FOOD PREP', 5],
  ['H81 - SUPERMARKETS W/4+ FOOD PREP', 91],
  ['H81R - SUPERMARKETS W/4+ FOOD PREP', 7],
  ['H83 - SUPERMARKETS GREATER THAN 20,000 SQFT W/1 FOOD PREP', 46],
  ['H83R - SUPERMARKETS GREATER THAN 20,000 SQFT W/1 FOOD PREP', 1],
  ['H86 - BARS/TAVERNS W/O FOOD PREP', 503],
  ['H86R - BARS/TAVERNS W/O FOOD PREP', 45],
  ['H87 - BARS/TAVERNS W/FOOD PREP', 232],
  ['H87R- BARS/TAVERNS W/FOOD PREP', 35],
  ['H88 - RETAIL BAKERIES WITH FOOD PREP', 200],
  ['H88R - RETAIL BAKERIES WITH FOOD PREP', 17],
  ['H89 - RETAIL BAKERIES W/O FOOD PREP', 7],
  ['H89R - RETAIL BAKERIES W/O FOOD PREP', 1],
  ['H14 - CERTIFIED FARMERS MARKETS', 153],
  ['H30 - CATERING FACILITIES', 46],
  ['H30R - CATERING FACILITIES', 7],
  ['H33 - COMMISSARIES', 100],
  ['H33R - COMMISSARIES', 6],
  ['H34 - PUSHCARTS (RETAIL FOOD VEHICLE)', 176],
  ['H36 - STADIUM CONCESSIONS (PERM)', 348],
  ['H36R - STADIUM CONCESSIONS (PERM)', 34],
  ['H40 - HOSPITAL KITCHENS', 10],
  ['H74 - CATERER', 95],
  ['H74R - CATERER', 17],
  ['H75 - MOBILE FOOD FACILITY CLASS 1', 7],
  ['H76 - MOBILE FOOD FACILITY CLASS 2', 13],
  ['H77 - MOBILE FOOD FACILITY CLASS 3', 19],
  ['H78 - MOBILE FOOD FACILITY CLASS 4', 125],
  ['H79 - MOBILE FOOD FACILITY CLASS 5', 455],
  ['H79R - MOBILE FOOD FACILITY CLASS 5', 3],
  ['H84 - EMPLOYEE CAFETERIAS W/FOOD PREP', 165],
  ['H84R - EMPLOYEE CAFETERIAS W/FOOD PREP', 26],
  ['H85 - EMPLOYEE CAFETERIA LIMITED FOOD PREP', 388],
  ['H85R - EMPLOYEE CAFETERIA LIMITED FOOD PREP', 116],
  ['H90 - SCHOOL CAFETERIAS (PRIVATE W/O FOOD PREP)', 35],
  ['H91 - SCHOOL CAFETERIAS (PRIVATE W/FOOD PREP)', 154],
  ['H91R - SCHOOL CAFETERIAS (PRIVATE W/FOOD PREP)', 5],
  ['H98 - COTTAGE FOOD OPERATIONS - TIER A (DIRECT SALES)', 40],
  ['H98R - COTTAGE FOOD OPERATIONS - TIER A (DIRECT SALES)', 7],
  ['H99 - COTTAGE FOOD OPERATIONS - TIER B (INDIRECT SALES)', 63],
  ['H99R - COTTAGE FOOD OPERATIONS - TIER B (INDIRECT SALES)', 11],
  ['H101 - Community Event Food Vendor - Low Hazard', 48],
  ['H102 - Community Event Food Vendor - High Hazard', 29],
  ['J06 - SKILLED NURSING FACILITIES', 1],
  ['J07 - CATERING FACILITY – NO COOKING', 85],
  ['J07R - CATERING FACILITY - NO COOKING', 11],
  ['J08 - COMMISSARY FOR MFF SERVICING', 2],
  ['J09 - COOKING SCHOOL', 5],
  ['J10 - HOST FACILITY', 1],
  ['J10R - HOST FACILITY', 1],
  ['J11 - SHARED KITCHEN COMPLEX, LESS THAN 2,000 SQ. FT.', 3],
  ['J12 - SHARED KITCHEN COMPLEX, GREATER THAN 2,000 SQ. FT.', 35],
  ['J12R - SHARED KITCHEN COMPLEX, GREATER THAN 2,000 SQ. FT.', 1],
  ['Child and Adult Care Food Program', 2],
  ['Limited Service Charitable Feeding Operation', 11],
  ['PUBLIC SCHOOL CAFETERIA WITH FOOD PREP', 333],
  ['Senior Nutrition Center', 21],
  ['Snack/Supper', 8],
  ['Summer Meals', 195],
  ['H31 - TOBACCO SALES - ANNUAL LICENSE FEE', 667],
  ['H31R - TOBACCO SALES - ANNUAL LICENSE FEE', 2],
  ['H37 - BED AND BREAKFAST', 3],
  ['H42 - PET SHOP - OVERNIGHT', 5],
  ['H43 - PET HOSPITAL - OVERNIGHT', 15],
  ['H44 - DOG KENNEL - OVERNIGHT', 16],
  ['H46 - AUTOMATIC LAUNDRY - FACILITIES', 127],
  ['H48 - WASH LAUNDRIES', 24],
  ['H56 - SWIMMING POOLS (YEAR-ROUND)', 1],
  ['H61 - VENDING MACHINES - COMPANIES', 18],
  ['H61R - VENDING MACHINES - COMPANIES', 2],
  ['H67 - MASSAGE ESTABLISHMENT', 192],
  ['H68 - GENERAL MASSAGE PRACTITIONER', 6],
  ['H69 - OUTCALL MASSAGE SERVICE', 2],
  ['H70 - SOLO MASSAGE ESTABLISHMENT', 41],
  ['J01 - TATTOO & PIERCING FACILITIES', 50],
]

const sum = (pred: (t: string) => boolean) => PROBED.reduce((s, [t, n]) => s + (pred(t) ? n : 0), 0)

/** Parse `permit_type IN ('a','b')` back into its strings. */
function inListStrings(where: string): string[] {
  const m = /^permit_type IN \((.*)\)$/s.exec(where)
  expect(m, where.slice(0, 80)).not.toBeNull()
  return [...m![1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"))
}

describe('foodPermits — exhaustive positive classification', () => {
  it('classifies every probed permit_type string', () => {
    expect(PROBED).toHaveLength(108)
    expect(unclassifiedPermitTypes(PROBED.map(([t]) => t))).toEqual([])
  })

  it('the table holds exactly the probed vocabulary (no stale or invented strings)', () => {
    expect(Object.keys(PERMIT_CLASS).sort()).toEqual(PROBED.map(([t]) => t).sort())
  })

  it('pins the class totals at the probe: FOOD = total − non-food', () => {
    const total = sum(() => true)
    const nonFood = sum((t) => classifyPermit(t) === 'non-food')
    expect(total).toBe(22_620)
    expect(sum((t) => classifyPermit(t) === 'storefront')).toBe(18_033)
    expect(sum((t) => classifyPermit(t) === 'offsite-food')).toBe(3_416)
    expect(nonFood).toBe(1_171)
    expect(sum(isFoodPermit)).toBe(total - nonFood)
    expect(sum(isFoodPermit)).toBe(21_449)
  })

  it('an unknown string fails safe: excluded from food and the map, and reported', () => {
    const novel = 'H99X - SOMETHING NEW'
    expect(classifyPermit(novel)).toBeNull()
    expect(isFoodPermit(novel)).toBe(false)
    expect(isStorefrontPermit(novel)).toBe(false)
    expect(unclassifiedPermitTypes([novel, novel, null, 'H24 - RESTAURANT UNDER 1,000 SQFT'])).toEqual([novel])
    expect(isFoodPermit(null)).toBe(false)
    // Exact spelling only — a trimmed or re-spaced variant is a NEW string.
    expect(classifyPermit('H23R - FOOD PREP AND SERVICE (FEE EXEMPT)')).toBeNull()
  })

  it('keeps the no-space-before-dash and en-dash spellings exactly', () => {
    expect(classifyPermit('H23R- FOOD PREP AND SERVICE (FEE EXEMPT)')).toBe('storefront')
    expect(classifyPermit('H87R- BARS/TAVERNS W/FOOD PREP')).toBe('storefront')
    expect(classifyPermit('J07 - CATERING FACILITY – NO COOKING')).toBe('offsite-food')
    expect(classifyPermit('J07R - CATERING FACILITY - NO COOKING')).toBe('offsite-food')
  })

  it('spec anchors land in their classes', () => {
    for (const code of ['H24', 'H25', 'H26', 'H28', 'H03', 'H07', 'H86', 'H87', 'H88', 'H23']) {
      const hits = PROBED.filter(([t]) => t.startsWith(`${code} `) || t.startsWith(`${code}R`))
      expect(hits.length, code).toBeGreaterThan(0)
      for (const [t] of hits) expect(classifyPermit(t), t).toBe('storefront')
    }
    for (const code of ['H79', 'H75', 'H76', 'H77', 'H78', 'H34', 'H14', 'H36', 'H33', 'J08', 'J11', 'J12', 'H74', 'H30', 'J07', 'H98', 'H99', 'H84', 'H85', 'H90', 'H91']) {
      const hits = PROBED.filter(([t]) => t.startsWith(`${code} `) || t.startsWith(`${code}R`))
      expect(hits.length, code).toBeGreaterThan(0)
      for (const [t] of hits) expect(classifyPermit(t), t).toBe('offsite-food')
    }
    for (const t of ['PUBLIC SCHOOL CAFETERIA WITH FOOD PREP', 'Summer Meals', 'Senior Nutrition Center', 'Snack/Supper']) {
      expect(classifyPermit(t), t).toBe('offsite-food')
    }
    for (const code of ['H31', 'H37', 'H42', 'H43', 'H44', 'H46', 'H48', 'H56', 'H61', 'H67', 'H68', 'H69', 'H70', 'J01']) {
      const hits = PROBED.filter(([t]) => t.startsWith(`${code} `) || t.startsWith(`${code}R`))
      expect(hits.length, code).toBeGreaterThan(0)
      for (const [t] of hits) expect(classifyPermit(t), t).toBe('non-food')
    }
  })

  it('cottage food (home addresses) is counted but never mapped', () => {
    const cottage = PROBED.filter(([t]) => /COTTAGE FOOD/.test(t)).map(([t]) => t)
    expect(cottage).toHaveLength(4)
    for (const t of cottage) {
      expect(isFoodPermit(t)).toBe(true)
      expect(isStorefrontPermit(t)).toBe(false)
    }
  })

  it('FOOD_WHERE / STOREFRONT_WHERE are exact twins of the JS predicates', () => {
    const food = inListStrings(FOOD_WHERE)
    const store = inListStrings(STOREFRONT_WHERE)
    expect(new Set(food)).toEqual(new Set(FOOD_PERMIT_TYPES))
    expect(new Set(store)).toEqual(new Set(STOREFRONT_PERMIT_TYPES))
    for (const [t] of PROBED) {
      expect(food.includes(t), t).toBe(isFoodPermit(t))
      expect(store.includes(t), t).toBe(isStorefrontPermit(t))
    }
    for (const t of NON_FOOD_PERMIT_TYPES) expect(food).not.toContain(t)
    // Storefront ⊂ food.
    for (const t of store) expect(food).toContain(t)
  })
})
