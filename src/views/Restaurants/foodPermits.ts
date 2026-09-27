// src/views/Restaurants/foodPermits.ts
//
// Which inspection rows are FOOD, and which food permits sit at a storefront.
// ZERO-IMPORT pure leaf — the view's live queries, the storefront generator
// (gate G0) and a DEV tripwire all read this ONE table.
//
// The classification is POSITIVE and EXHAUSTIVE: every `permit_type` string
// tvy3-wexg publishes is listed by its exact spelling, whitespace and dash
// included ('H23R- …' and 'H87R- …' have no space before the dash; J07 uses an
// en dash, J07R a hyphen). A string that is not in the table is UNCLASSIFIED,
// and an unclassified string is EXCLUDED from every count and every map — a
// new permit program DPH starts publishing can never leak into the food totals
// silently (the old NOT-list failed open). G0 refuses to build the snapshot
// while the live vocabulary holds one; the DEV tripwire names it in the
// console.
//
// Three classes (spec §3.2):
//   storefront    — a fixed premises the public walks into: restaurants,
//                   take-outs, fast food, markets and supermarkets, bakeries,
//                   bars, fee-exempt food service, plus wholesale markets and
//                   food manufacturing (commercial premises, never homes).
//                   Counted AND mapped.
//   offsite-food  — food permits with no storefront of their own: mobile
//                   facilities, pushcarts, caterers, commissaries, shared
//                   kitchens, farmers markets, stadium stands, event vendors,
//                   cottage food (HOME addresses), cafeterias, institutional
//                   kitchens and the uncoded meal programs. Counted, NEVER
//                   mapped.
//   non-food      — tobacco, bed and breakfast, pets, laundries, a swimming
//                   pool, vending companies, massage, tattoo. Neither.
//
// Re-probed live on data.sf.gov 2026-09-24:
//   SELECT permit_type, count(*) GROUP BY permit_type
// → 108 distinct strings, 22,620 rows (22,619 dated on or before today + the
// junk 2031-05-16 row); storefront 18,033 · offsite-food 3,416 · non-food
// 1,171, so FOOD = 22,620 − 1,171 = 21,449. The spec's 1,170 (A §2) left
// 'H56 - SWIMMING POOLS (YEAR-ROUND)' (1 row) out of non-food; a pool is not a
// food permit, so the spec's 21,433 reads 21,432 under this table.

export type PermitClass = 'storefront' | 'offsite-food' | 'non-food'

/** Every permit_type string on tvy3-wexg, by exact spelling → its class. */
export const PERMIT_CLASS: Readonly<Record<string, PermitClass>> = {
  // ── storefront ──
  'H03 - RETAIL MKTS W/O PREP (UNDER 5001)': 'storefront',
  'H03R - RETAIL MKTS W/O PREP (UNDER 5001)': 'storefront',
  'H04 - RETAIL MKTS W/O PREP (5001 - 10000)': 'storefront',
  'H04R - RETAIL MKTS W/O PREP (5001 - 10000)': 'storefront',
  'H05 - RETAIL MKTS W/O PREP (10001 - 20000)': 'storefront',
  'H05R - RETAIL MKTS W/O PREP (10001 - 20000)': 'storefront',
  'H06 - RETAIL MKTS W/O PREP (OVER 20000)': 'storefront',
  'H06R - RETAIL MKTS W/O PREP (OVER 20000)': 'storefront',
  'H07 - RETAIL MKTS W/FOOD PREP (UNDER 5001)': 'storefront',
  'H07R - RETAIL MKTS W/FOOD PREP (UNDER 5001)': 'storefront',
  'H08 - RETAIL MKTS W/FOOD PREP (10001 - 20000)': 'storefront',
  'H08R - RETAIL MKTS W/FOOD PREP (10001 - 20000)': 'storefront',
  'H09 - RETAIL MKTS W/FOOD PREP (5001 - 10000)': 'storefront',
  'H09R - RETAIL MKTS W/FOOD PREP (5001 - 10000)': 'storefront',
  'H15 - WHOLESALE FOOD MARKETS': 'storefront',
  'H15R - WHOLESALE FOOD MARKETS': 'storefront',
  'H18 - WHOLESALE FOOD MARKETS': 'storefront',
  'H21 - WHOLESALE FOOD MARKETS': 'storefront',
  'H21R - WHOLESALE FOOD MARKETS': 'storefront',
  'H22 - FOOD MANUFACTURING/PROCESSING': 'storefront',
  'H22R - FOOD MANUFACTURING/PROCESSING': 'storefront',
  'H23 - FOOD PREP AND SERVICE (FEE EXEMPT)': 'storefront',
  'H23R- FOOD PREP AND SERVICE (FEE EXEMPT)': 'storefront',
  'H24 - RESTAURANT UNDER 1,000 SQFT': 'storefront',
  'H24R - RESTAURANT UNDER 1,000 SQFT': 'storefront',
  'H25 - RESTAURANT 1,000 - 2,000 SQFT': 'storefront',
  'H25R - RESTAURANT 1,000 - 2,000 SQFT': 'storefront',
  'H26 - RESTAURANT OVER 2,000 SQFT': 'storefront',
  'H26R - RESTAURANT OVER 2,000 SQFT': 'storefront',
  'H28 - TAKE-OUTS': 'storefront',
  'H28R - TAKE-OUTS': 'storefront',
  'H29 - FAST FOOD OUTLETS': 'storefront',
  'H29R - FAST FOOD OUTLETS': 'storefront',
  'H80 - SUPERMARKETS W/2-3 FOOD PREP': 'storefront',
  'H81 - SUPERMARKETS W/4+ FOOD PREP': 'storefront',
  'H81R - SUPERMARKETS W/4+ FOOD PREP': 'storefront',
  'H83 - SUPERMARKETS GREATER THAN 20,000 SQFT W/1 FOOD PREP': 'storefront',
  'H83R - SUPERMARKETS GREATER THAN 20,000 SQFT W/1 FOOD PREP': 'storefront',
  'H86 - BARS/TAVERNS W/O FOOD PREP': 'storefront',
  'H86R - BARS/TAVERNS W/O FOOD PREP': 'storefront',
  'H87 - BARS/TAVERNS W/FOOD PREP': 'storefront',
  'H87R- BARS/TAVERNS W/FOOD PREP': 'storefront',
  'H88 - RETAIL BAKERIES WITH FOOD PREP': 'storefront',
  'H88R - RETAIL BAKERIES WITH FOOD PREP': 'storefront',
  'H89 - RETAIL BAKERIES W/O FOOD PREP': 'storefront',
  'H89R - RETAIL BAKERIES W/O FOOD PREP': 'storefront',
  // ── offsite-food ──
  'H14 - CERTIFIED FARMERS MARKETS': 'offsite-food',
  'H30 - CATERING FACILITIES': 'offsite-food',
  'H30R - CATERING FACILITIES': 'offsite-food',
  'H33 - COMMISSARIES': 'offsite-food',
  'H33R - COMMISSARIES': 'offsite-food',
  'H34 - PUSHCARTS (RETAIL FOOD VEHICLE)': 'offsite-food',
  'H36 - STADIUM CONCESSIONS (PERM)': 'offsite-food',
  'H36R - STADIUM CONCESSIONS (PERM)': 'offsite-food',
  'H40 - HOSPITAL KITCHENS': 'offsite-food',
  'H74 - CATERER': 'offsite-food',
  'H74R - CATERER': 'offsite-food',
  'H75 - MOBILE FOOD FACILITY CLASS 1': 'offsite-food',
  'H76 - MOBILE FOOD FACILITY CLASS 2': 'offsite-food',
  'H77 - MOBILE FOOD FACILITY CLASS 3': 'offsite-food',
  'H78 - MOBILE FOOD FACILITY CLASS 4': 'offsite-food',
  'H79 - MOBILE FOOD FACILITY CLASS 5': 'offsite-food',
  'H79R - MOBILE FOOD FACILITY CLASS 5': 'offsite-food',
  'H84 - EMPLOYEE CAFETERIAS W/FOOD PREP': 'offsite-food',
  'H84R - EMPLOYEE CAFETERIAS W/FOOD PREP': 'offsite-food',
  'H85 - EMPLOYEE CAFETERIA LIMITED FOOD PREP': 'offsite-food',
  'H85R - EMPLOYEE CAFETERIA LIMITED FOOD PREP': 'offsite-food',
  'H90 - SCHOOL CAFETERIAS (PRIVATE W/O FOOD PREP)': 'offsite-food',
  'H91 - SCHOOL CAFETERIAS (PRIVATE W/FOOD PREP)': 'offsite-food',
  'H91R - SCHOOL CAFETERIAS (PRIVATE W/FOOD PREP)': 'offsite-food',
  'H98 - COTTAGE FOOD OPERATIONS - TIER A (DIRECT SALES)': 'offsite-food',
  'H98R - COTTAGE FOOD OPERATIONS - TIER A (DIRECT SALES)': 'offsite-food',
  'H99 - COTTAGE FOOD OPERATIONS - TIER B (INDIRECT SALES)': 'offsite-food',
  'H99R - COTTAGE FOOD OPERATIONS - TIER B (INDIRECT SALES)': 'offsite-food',
  'H101 - Community Event Food Vendor - Low Hazard': 'offsite-food',
  'H102 - Community Event Food Vendor - High Hazard': 'offsite-food',
  'J06 - SKILLED NURSING FACILITIES': 'offsite-food',
  'J07 - CATERING FACILITY – NO COOKING': 'offsite-food',
  'J07R - CATERING FACILITY - NO COOKING': 'offsite-food',
  'J08 - COMMISSARY FOR MFF SERVICING': 'offsite-food',
  'J09 - COOKING SCHOOL': 'offsite-food',
  'J10 - HOST FACILITY': 'offsite-food',
  'J10R - HOST FACILITY': 'offsite-food',
  'J11 - SHARED KITCHEN COMPLEX, LESS THAN 2,000 SQ. FT.': 'offsite-food',
  'J12 - SHARED KITCHEN COMPLEX, GREATER THAN 2,000 SQ. FT.': 'offsite-food',
  'J12R - SHARED KITCHEN COMPLEX, GREATER THAN 2,000 SQ. FT.': 'offsite-food',
  'Child and Adult Care Food Program': 'offsite-food',
  'Limited Service Charitable Feeding Operation': 'offsite-food',
  'PUBLIC SCHOOL CAFETERIA WITH FOOD PREP': 'offsite-food',
  'Senior Nutrition Center': 'offsite-food',
  'Snack/Supper': 'offsite-food',
  'Summer Meals': 'offsite-food',
  // ── non-food ──
  'H31 - TOBACCO SALES - ANNUAL LICENSE FEE': 'non-food',
  'H31R - TOBACCO SALES - ANNUAL LICENSE FEE': 'non-food',
  'H37 - BED AND BREAKFAST': 'non-food',
  'H42 - PET SHOP - OVERNIGHT': 'non-food',
  'H43 - PET HOSPITAL - OVERNIGHT': 'non-food',
  'H44 - DOG KENNEL - OVERNIGHT': 'non-food',
  'H46 - AUTOMATIC LAUNDRY - FACILITIES': 'non-food',
  'H48 - WASH LAUNDRIES': 'non-food',
  'H56 - SWIMMING POOLS (YEAR-ROUND)': 'non-food',
  'H61 - VENDING MACHINES - COMPANIES': 'non-food',
  'H61R - VENDING MACHINES - COMPANIES': 'non-food',
  'H67 - MASSAGE ESTABLISHMENT': 'non-food',
  'H68 - GENERAL MASSAGE PRACTITIONER': 'non-food',
  'H69 - OUTCALL MASSAGE SERVICE': 'non-food',
  'H70 - SOLO MASSAGE ESTABLISHMENT': 'non-food',
  'J01 - TATTOO & PIERCING FACILITIES': 'non-food',
}

const typesOf = (...classes: PermitClass[]): readonly string[] =>
  Object.keys(PERMIT_CLASS).filter((t) => classes.includes(PERMIT_CLASS[t]))

export const STOREFRONT_PERMIT_TYPES: readonly string[] = typesOf('storefront')
export const FOOD_PERMIT_TYPES: readonly string[] = typesOf('storefront', 'offsite-food')
export const NON_FOOD_PERMIT_TYPES: readonly string[] = typesOf('non-food')

/** The class of one permit_type, or null when the string is not in the table
 *  (unclassified → excluded everywhere). */
export function classifyPermit(permitType: string | null | undefined): PermitClass | null {
  if (!permitType) return null
  return Object.prototype.hasOwnProperty.call(PERMIT_CLASS, permitType) ? PERMIT_CLASS[permitType] : null
}

/** JS twin of FOOD_WHERE: counted in the cards and the neighborhood rates. */
export function isFoodPermit(permitType: string | null | undefined): boolean {
  const c = classifyPermit(permitType)
  return c === 'storefront' || c === 'offsite-food'
}

/** JS twin of STOREFRONT_WHERE: the only permits ever drawn on the map. */
export function isStorefrontPermit(permitType: string | null | undefined): boolean {
  return classifyPermit(permitType) === 'storefront'
}

/** The strings in `permitTypes` the table does not know, sorted and deduped —
 *  generator gate G0 fails on a non-empty result; the view's DEV tripwire
 *  logs it. */
export function unclassifiedPermitTypes(permitTypes: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>()
  for (const t of permitTypes) if (t && classifyPermit(t) === null) out.add(t)
  return [...out].sort()
}

const soqlString = (s: string): string => `'${s.replace(/'/g, "''")}'`
const inList = (types: readonly string[]): string => `permit_type IN (${types.map(soqlString).join(',')})`

/** `permit_type IN (…every food string…)` — generated from the table, never
 *  hand-typed, so the SoQL and the JS predicate cannot disagree. */
export const FOOD_WHERE: string = inList(FOOD_PERMIT_TYPES)

/** `permit_type IN (…every storefront string…)`. */
export const STOREFRONT_WHERE: string = inList(STOREFRONT_PERMIT_TYPES)
