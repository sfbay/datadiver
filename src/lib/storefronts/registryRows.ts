// LEAF (imports only ./storefrontKey) — the business-registry (`g8m3-pdis`)
// row shape and the row-level filters every registry consumer shares.
//
// Three traps this module owns (spec §3.5, §3.8, F §1–2):
//   · LANDLORD ROWS. A building's owner registers the building as a business
//     ("2077-2095 Hayes St Commercials", "570 Green St"). Left in, the landlord
//     becomes a candidate owner for every tenant at the door — and, being the
//     one continuous registration, reads as "same owner" across a parade of
//     restaurants. A restaurant NAMED for its address ('25 Lusk') is food-coded
//     and is kept.
//   · THE FOOD FILTER sees only survivors. NAICS 722 alone misses 1,701 open
//     food businesses (5,774 vs 7,475 open rows, F §2), so food = NAICS 722 OR
//     a DPH license code in `lic`. And turnover joins the registry by ADDRESS,
//     never through this filter — every predecessor tenant is untagged (E T11).
//   · DUPLICATES. `$offset` paging returned stray duplicate rows (F pitfalls):
//     dedupe on `uniqueid` before counting anything.

import { storefrontKey, keyParts } from './storefrontKey'

/** The `g8m3-pdis` columns the generator selects (spec §3.4 + §11's mail city). */
export interface RegistryRow {
  uniqueid: string
  certificate_number?: string
  ownership_name?: string
  dba_name?: string
  full_business_address?: string
  location_start_date?: string
  location_end_date?: string
  dba_end_date?: string
  administratively_closed?: string
  mailing_address_1?: string
  mail_city?: string
  mail_state?: string
  mail_zipcode?: string
  self_reported_naics_code?: string
  lic?: string
}

/** DPH food license codes (F §2), with the post-2025 'R' reissue variant. */
export const FOOD_LICENSE_RE = /\b(H2[3-9]|H86|H87|H88|H74|H30|H33|H79|H36|H85|H84)R?\b/

/** Cut a registry datetime to its 'YYYY-MM-DD' day; null when blank. */
export function registryDay(value: string | null | undefined): string | null {
  return value && value.length >= 10 ? value.slice(0, 10) : null
}

/** Still registered at this location: no location end (and, when the columns
 *  are present, no trade-name end and not administratively closed). */
export function isOpenRow(row: RegistryRow): boolean {
  return !row.location_end_date && !row.dba_end_date && !row.administratively_closed
}

export function isFoodRegistryRow(row: RegistryRow): boolean {
  return (row.self_reported_naics_code ?? '').startsWith('722') || FOOD_LICENSE_RE.test(row.lic ?? '')
}

const BUILDING_WORDS = /\b(BUILDING|BLDG|COMMERCIALS?|APTS|APARTMENTS)\b/

/**
 * A landlord / building registration: the trade name is the building itself —
 * it contains BUILDING / COMMERCIALS / APTS, or it BEGINS WITH THE HOUSE NUMBER
 * of the business address and names that same street ('570 Green St',
 * '2077-2095 Hayes', '570a Greenwich'). A food-coded row is never a landlord
 * row, which keeps restaurants named for their address.
 */
export function isLandlordRow(row: RegistryRow): boolean {
  if (isFoodRegistryRow(row)) return false
  const dba = (row.dba_name ?? '').toUpperCase()
  if (!dba) return false
  if (BUILDING_WORDS.test(dba)) return true
  const biz = keyParts(storefrontKey(row.full_business_address))
  const named = keyParts(storefrontKey(row.dba_name))
  if (!biz || !named) return false
  const num = (n: string) => n.replace(/[A-Z]$/, '')
  return num(named.number) === num(biz.number) && named.street === biz.street
}

/** Drop duplicate `uniqueid` rows, keeping the first seen. */
export function dedupeByUniqueId<T extends { uniqueid: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (seen.has(r.uniqueid)) continue
    seen.add(r.uniqueid)
    out.push(r)
  }
  return out
}
