// LEAF (imports only ./nameChain, ./registryRows) — cross-era facility
// identity and the registry join (spec §3.5, B §5, F §1).
//
// THREE DATASETS, NO SHARED KEY. What links them, measured:
//   · pyih-qa8i (2016–19) `business_id` = 5tti-66ds (2020–23) `inspection_id`
//     minus its last 8 characters (the YYYYMMDD date) — 99% agree.
//   · into tvy3-wexg (2024+) BY ID ONLY when the id is ≥ 60,000 AND the
//     storefront keys agree. Below 60k, 22 of 30 matches under 20k were false
//     collisions: DPH renumbered old facilities (Swan Oyster Depot 639 → 305).
//     Otherwise identity is normalized name + storefront key.
//   · the business registry (g8m3-pdis) NEVER on a number — 239 zero-padded
//     "matches" were coincidences (Benihana's permit = Tiffany & Co.'s account
//     number). Storefront key + name similarity ≥ 0.6 links 90.8% of permits
//     (95.4% of restaurant/bar permits), and when 2+ registrations qualify
//     (17.2% of linked permits) the owner is picked by DATE WINDOW: the
//     registration whose location_start/end contains the operator's dates.

import { daysBetween, sequenceRatio } from './nameChain'
import { isLandlordRow, registryDay, type RegistryRow } from './registryRows'

/** Numeric ids below this are never joined across eras by number (B trap 4). */
export const ID_JOIN_FLOOR = 60_000
/** Registry name-similarity floor for the storefront-key join (F §1). */
export const REGISTRY_NAME_FLOOR = 0.6

/** 5tti `inspection_id` ('8733820220615') → its facility id ('87338'), which
 *  is also the pyih `business_id`. */
export function facilityIdFrom5tti(inspectionId: string): string {
  return inspectionId.length > 8 ? inspectionId.slice(0, -8) : ''
}

/** The 5tti inspection key — 230 same-day `inspection_id` collisions (B trap 2)
 *  mean the id alone is not one inspection; id + type is. */
export function inspectionKey5tti(inspectionId: string, inspectionType: string | null | undefined): string {
  return `${inspectionId}|${inspectionType ?? ''}`
}

/**
 * May an old facility id be joined to a 2024+ permit number BY NUMBER? Only
 * when both are the same plain number, that number is ≥ 60,000, and the two
 * storefront keys agree. Everything else goes through name + key.
 */
export function canJoinById(oldId: string, permitNumber: string, sameStorefront: boolean): boolean {
  if (!sameStorefront) return false
  if (!/^\d+$/.test(oldId) || !/^\d+$/.test(permitNumber)) return false
  const a = Number(oldId)
  return a === Number(permitNumber) && a >= ID_JOIN_FLOOR
}

// ── registry names ────────────────────────────────────────────────────

const LEGAL_FORMS = /\b(INC|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|THE)\b/g
const TOKEN_STOP = new Set([
  'INC', 'LLC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LP', 'LLP', 'THE', 'AND', 'RESTAURANT', 'CAFE',
  'SF', 'OF', 'DBA', 'BAR', 'KITCHEN', 'GRILL', 'SAN', 'FRANCISCO',
])

/** Registry-join name form: upper-case, apostrophes dropped, '&' → AND,
 *  punctuation blanked, legal forms removed. */
export function registryNameForm(name: string | null | undefined): string {
  let s = (name ?? '').toUpperCase().replace(/[’'`]/g, '').replace(/&/g, ' AND ')
  s = s.replace(/[^A-Z0-9 ]/g, ' ').replace(LEGAL_FORMS, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

function distinctiveTokens(name: string): Set<string> {
  const s = (name ?? '').toUpperCase().replace(/[’'`]/g, '').replace(/[^A-Z0-9 ]/g, ' ')
  return new Set(s.split(' ').filter((w) => w.length > 1 && !TOKEN_STOP.has(w)))
}

/** Name similarity for the registry join: 1 on an exact normalized match,
 *  else the larger of distinctive-word Jaccard and sequence similarity. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = registryNameForm(a)
  const nb = registryNameForm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = distinctiveTokens(a ?? '')
  const tb = distinctiveTokens(b ?? '')
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  const union = new Set([...ta, ...tb]).size
  const jaccard = ta.size && tb.size ? shared / union : 0
  return Math.max(jaccard, sequenceRatio(na, nb))
}

export interface RegistryPick {
  row: RegistryRow
  /** max(similarity to dba_name, similarity to ownership_name) */
  similarity: number
  /** How many of the operator's inspection dates fall inside the registration window. */
  coverage: number
}

/** Does the registration window contain this 'YYYY-MM-DD' day? An open
 *  registration (no end) runs to today. */
export function registrationCovers(row: RegistryRow, day: string): boolean {
  const start = registryDay(row.location_start_date)
  const end = registryDay(row.location_end_date)
  return (!start || start <= day) && (!end || day <= end)
}

/**
 * Pick the owner of record for one operator at one storefront.
 *
 * `candidates` are the registry rows whose storefront key equals this door's
 * (the caller joins by ADDRESS; never pre-filter by NAICS — predecessors are
 * untagged, E T11). Landlord rows are dropped; the rest must reach name
 * similarity ≥ 0.6 against the operator's name (trade name or owner name).
 * Among those, the registration whose window covers the most of the
 * operator's inspection dates wins; ties → higher similarity → later start →
 * uniqueid, so the pick is deterministic.
 *
 * null when nothing qualifies — including when no qualifying registration's
 * window covers even ONE of the operator's dates. A same-named registration
 * that ended before the operator was ever inspected is a predecessor's paper,
 * not this operator's owner (570 Green St: Chubby Noodle, inspected
 * 2020–23, matches only registrations that ended by 2019).
 */
export function pickRegistryRow(
  candidates: readonly RegistryRow[],
  operator: { name: string; dateList: readonly string[] },
): RegistryPick | null {
  let best: RegistryPick | null = null
  for (const row of candidates) {
    if (isLandlordRow(row)) continue
    const similarity = Math.max(
      nameSimilarity(operator.name, row.dba_name),
      nameSimilarity(operator.name, row.ownership_name),
    )
    if (similarity < REGISTRY_NAME_FLOOR) continue
    const coverage = operator.dateList.filter((d) => registrationCovers(row, d)).length
    const pick: RegistryPick = { row, similarity, coverage }
    if (!best || comparePicks(pick, best) < 0) best = pick
  }
  return best && best.coverage > 0 ? best : null
}

function comparePicks(a: RegistryPick, b: RegistryPick): number {
  if (a.coverage !== b.coverage) return b.coverage - a.coverage
  if (a.similarity !== b.similarity) return b.similarity - a.similarity
  const sa = registryDay(a.row.location_start_date) ?? ''
  const sb = registryDay(b.row.location_start_date) ?? ''
  if (sa !== sb) return sa > sb ? -1 : 1
  return a.row.uniqueid < b.row.uniqueid ? -1 : a.row.uniqueid > b.row.uniqueid ? 1 : 0
}

/** Days a registration has run at the location, through its end or `asOf`
 *  ('YYYY-MM-DD'); null without a start date. Feeds the ghost rule. */
export function registryTenureDays(row: RegistryRow, asOf: string): number | null {
  const start = registryDay(row.location_start_date)
  if (!start) return null
  const end = registryDay(row.location_end_date) ?? asOf
  return Math.max(0, daysBetween(start, end))
}
