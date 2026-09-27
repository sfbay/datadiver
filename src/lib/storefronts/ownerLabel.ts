// ZERO-IMPORT LEAF — who an owner of record is, and what of their
// registration DataDiver may publish (spec §11, which supersedes §7.2).
//
// THE RULING (Jesse, 2026-09-24). Owner NAMES are shown for every owner,
// persons included, exactly as the city registry publishes them. This module
// no longer decides whether a name appears. It decides three narrower things:
//
//   1. `ownerKind` — company / individual / unknown. Drives ADDRESS display
//      (a mailing street is shown only when every owner at it is a company),
//      `/business/owner/:name` link eligibility (companies only), and search
//      indexing (no feature searches BY a natural person's name). Every
//      non-company kind is treated as a possible person — fail safe.
//   2. `mailCityLabel` — the owner's mailing CITY as a plain city name
//      ('Daly City'). No "lives in", no "mailing city on registration" on the
//      chrome; what a mailing city means (correspondence, not residence; head
//      offices for big operators — Aramark Philadelphia, Compass Charlotte) is
//      data-notes copy.
//   3. `isUndeliverableMailing` — the city's placeholder. 5,862 registrations
//      carry '0000 Undeliverable Mail' (+ 5 '9999 Undeliverable St') with
//      mail_city 'San Francisco' (measured 2026-09-24). That city is the
//      placeholder's, not the owner's: render NO city, never "San Francisco".
//
// A natural person's mailing street and ZIP are never read out of this module
// — StorefrontOwner has no field for them (types.ts).

import type { OwnerKind, StorefrontOwner } from './types'

/** Registered-entity suffixes (F §6's authored list + the spelled-out and
 *  professional forms). Matched as whole words after '.' and ',' are blanked,
 *  so 'L.L.C.' reads as 'L L C' and 'Macy's, Inc.' as '… INC'. */
const COMPANY_SUFFIX = /\b(INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LP|L P|LLP|LTD|PC|P C|PLLC)\b/

/**
 * Proven companies whose registered name carries no suffix. Each row needs a
 * reason a reader could check; add sparingly — the default for a suffixless
 * name is NOT company.
 *   LEVY RESTAURANTS  the stadium/arena food-service company (Compass Group
 *                     subsidiary) — 82 open registrations, 2026-09-24
 *   SMG               the venue-management company (now ASM Global) — 23 open
 *                     registrations at city venues, 2026-09-24
 */
export const KNOWN_COMPANIES: ReadonlySet<string> = new Set(['LEVY RESTAURANTS', 'SMG'])

/** Words that make a suffixless name read as a business or institution, not a
 *  person ('Kungfu Noodle Express', 'Levy Family Trust'). Such names are
 *  'unknown' — never labelled a person, never treated as a company. */
const ENTITY_WORDS = new RegExp(
  '\\b(' +
    [
      'GROUP', 'ENTERPRISES?', 'HOLDINGS?', 'PARTNERS(HIP)?', 'PTRSHP', 'ASSOCIATES', 'ASSN', 'ASSOCIATION',
      'FOUNDATION', 'TRUST', 'SERVICES?', 'MANAGEMENT', 'MGMT', 'VENTURES?', 'INVESTMENTS?', 'INTERNATIONAL',
      'INTL', 'USA', 'AMERICA', 'SYSTEMS', 'CLUB', 'SOCIETY', 'UNIVERSITY', 'COLLEGE', 'SCHOOL', 'CHURCH',
      'CENTER', 'HOSPITAL', 'CITY', 'COUNTY', 'STATE', 'DEPT', 'DEPARTMENT', 'AUTHORITY', 'FOODS?',
      'RESTAURANTS?', 'CAFE', 'KITCHEN', 'BAKERY', 'BAR', 'GRILL', 'MARKET', 'COFFEE', 'TEA', 'PIZZA', 'SUSHI',
      'DELI', 'TAQUERIA', 'TACOS?', 'NOODLES?', 'EXPRESS', 'BURGERS?', 'BBQ', 'RAMEN', 'CATERING',
      'HOSPITALITY', 'BRANDS', 'CONCEPTS', 'OPCO', 'OPERATIONS', 'OPERATING', 'HOTEL', 'STORES?', 'SHOP',
      'HOUSE', 'LOUNGE', 'TRUCK', 'EATS', 'DINING', 'BREWING', 'WINE', 'LIQUORS?', 'PRODUCTS', 'IMPORTS?',
      'TRADING', 'DEVELOPMENT', 'PROPERTIES', 'REALTY', 'CAPITAL', 'FUND', 'NETWORK', 'LABS?', 'TECHNOLOGIES',
      'PLATFORMS', 'ETAL', 'ET AL', 'SUBS', 'SANDWICH(ES)?', 'BISTRO', 'CREAMERY',
    ].join('|') +
    ')\\b',
)

/** Upper-case, '.'/',' blanked, whitespace collapsed — the classification form. */
function classifyForm(name: string): string {
  return name.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The owner name exactly as published, with only whitespace collapsed. */
export function cleanOwnerName(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim()
}

/** True when the registered name carries a company suffix, or is an authored
 *  KNOWN_COMPANIES entry. When in doubt, it is not a company. */
export function isCompany(name: string | null | undefined): boolean {
  const s = classifyForm(name ?? '')
  if (!s) return false
  if (COMPANY_SUFFIX.test(s)) return true
  return KNOWN_COMPANIES.has(s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())
}

/**
 * company     isCompany
 * individual  2–6 alphabetic words, no digits, no business/institution word —
 *             the shape of 'Aguilar Marco', 'Levy David & Erlanger William'
 * unknown     everything else: blank, one word, business-sounding without a
 *             registered suffix ('Kungfu Noodle Express', 'Petersen Adele Etal')
 */
export function ownerKind(name: string | null | undefined): OwnerKind {
  const s = classifyForm(name ?? '')
  if (!s) return 'unknown'
  if (isCompany(s)) return 'company'
  if (/\d/.test(s) || ENTITY_WORDS.test(s)) return 'unknown'
  const words = s.replace(/[^A-Z' -]/g, ' ').split(/[\s-]+/).filter((w) => /[A-Z]/.test(w))
  return words.length >= 2 && words.length <= 6 ? 'individual' : 'unknown'
}

/** The registry's undeliverable placeholder ('0000 Undeliverable Mail',
 *  '9999 Undeliverable St'), matched case-insensitively — a case-sensitive
 *  `like` returns 0 (F §3 pitfall 5). The ZIP is NOT the test: one real PO box
 *  in Indianapolis carries 99999. */
export function isUndeliverableMailing(mailingAddress: string | null | undefined): boolean {
  return /UNDELIVERABLE/.test((mailingAddress ?? '').toUpperCase())
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase())
}

/**
 * The plain mailing city for display: whitespace collapsed ('San  Francisco'
 * occurs), title-cased only if the registry wrote it all-caps; null for a
 * blank city or an undeliverable placeholder row. Never a state, never a
 * label — just the city.
 */
export function mailCityLabel(row: { mailing_address_1?: string | null; mail_city?: string | null }): string | null {
  if (isUndeliverableMailing(row.mailing_address_1)) return null
  const city = (row.mail_city ?? '').replace(/\s+/g, ' ').trim()
  if (!city) return null
  return /[a-z]/.test(city) ? city : titleCase(city)
}

/** The published owner record for one registry row. */
export function ownerOf(row: {
  ownership_name?: string | null
  mailing_address_1?: string | null
  mail_city?: string | null
}): StorefrontOwner {
  const name = cleanOwnerName(row.ownership_name)
  return { name, kind: ownerKind(name), mailCity: mailCityLabel(row) }
}
