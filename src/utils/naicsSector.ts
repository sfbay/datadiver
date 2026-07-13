/** NAICS-code → SF business-activity category crosswalk.
 *
 *  Background: in mid-2026 DataSF removed the pre-computed `naic_code`,
 *  `naic_code_description`, and `naics_code_descriptions_list` columns from the
 *  Registered Business Locations dataset (`g8m3-pdis`), leaving only the raw
 *  `self_reported_naics_code`. Every "sector" label DataDiver shows used to come
 *  straight from that dropped column. This module reconstructs the sector from
 *  the raw code using the standard NAICS sector taxonomy, grouped into the same
 *  category names the app already displays (see SectorFilter's SECTOR_COLORS).
 *
 *  Match is LONGEST-PREFIX: 3-digit keys are tried before 2-digit. Only NAICS 72
 *  needs the finer split — 721 Accommodations vs 722 Food Services are distinct
 *  DataDiver categories; every other sector resolves at 2 digits.
 *
 *  SF's self-reported field is noisy — it carries legacy/garbage prefixes like
 *  `00`, `20`, `59` that aren't valid NAICS sectors. Those resolve to
 *  'Uncategorized' rather than being force-fit, per the honest-data principle.
 */

export const UNCATEGORIZED = 'Uncategorized'

// 3-digit prefixes take priority. Only NAICS 72 splits into two DataDiver
// categories, so it's the only entry that needs three-digit resolution.
const NAICS3: Record<string, string> = {
  '721': 'Accommodations',
  '722': 'Food Services',
}

// 2-digit NAICS sectors → DataDiver category names. Names for the colored
// sectors match SectorFilter's SECTOR_COLORS keys exactly so their accent
// colors keep resolving; the rest fall to the neutral default swatch.
const NAICS2: Record<string, string> = {
  '11': 'Agriculture, Forestry, Fishing and Hunting',
  '21': 'Mining, Quarrying, and Oil and Gas Extraction',
  '22': 'Utilities',
  '23': 'Construction',
  '31': 'Manufacturing',
  '32': 'Manufacturing',
  '33': 'Manufacturing',
  '42': 'Wholesale Trade',
  '44': 'Retail Trade',
  '45': 'Retail Trade',
  '48': 'Transportation and Warehousing',
  '49': 'Transportation and Warehousing',
  '51': 'Information',
  '52': 'Financial Services',
  '53': 'Real Estate and Rental and Leasing Services',
  '54': 'Professional, Scientific, and Technical Services',
  '55': 'Management of Companies and Enterprises',
  '56': 'Administrative and Support Services',
  '61': 'Private Education and Health Services',
  '62': 'Private Education and Health Services',
  '71': 'Arts, Entertainment, and Recreation',
  // Bare "72" with no 721/722 refinement is near-nonexistent in the data;
  // 722 (Food Services) dominates NAICS 72, so it's the safe fallback.
  '72': 'Food Services',
  '81': 'Other Services',
  '92': 'Public Administration',
}

/** Map a raw self-reported NAICS code to its DataDiver sector name.
 *  Null/blank/short/unrecognized codes → 'Uncategorized'. */
export function naicsSector(code: string | null | undefined): string {
  if (!code) return UNCATEGORIZED
  const digits = String(code).replace(/\D/g, '')
  if (digits.length < 2) return UNCATEGORIZED
  const three = NAICS3[digits.slice(0, 3)]
  if (three) return three
  return NAICS2[digits.slice(0, 2)] ?? UNCATEGORIZED
}

/** Reverse map: category label → the NAICS code prefixes that produce it.
 *  Used to build server-side WHERE filters (LIKE 'prefix%'). Bare '72' is
 *  intentionally excluded — its rows are already covered by the 721/722
 *  prefixes, and a '72%' LIKE would sweep Accommodations into Food Services. */
export const SECTOR_PREFIXES: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const [prefix, label] of Object.entries(NAICS3)) (m[label] ??= []).push(prefix)
  for (const [prefix, label] of Object.entries(NAICS2)) {
    if (prefix === '72') continue
    ;(m[label] ??= []).push(prefix)
  }
  return m
})()

/** Build a Socrata SoQL predicate selecting rows whose NAICS code maps to any
 *  of the given category labels. Returns '' when nothing constrains (so callers
 *  can join it conditionally). 'Uncategorized' resolves to a null-code test —
 *  per data-insights.md ~96% of uncategorized rows have a null code, so this
 *  captures the overwhelming majority (rare junk-prefix codes are a known miss). */
export function sectorWhereClause(
  labels: string[],
  column = 'self_reported_naics_code',
): string {
  const conditions: string[] = []
  for (const label of labels) {
    if (label === UNCATEGORIZED) {
      conditions.push(`${column} IS NULL`)
      continue
    }
    for (const prefix of SECTOR_PREFIXES[label] ?? []) {
      conditions.push(`${column} LIKE '${prefix}%'`)
    }
  }
  if (conditions.length === 0) return ''
  return `(${conditions.join(' OR ')})`
}
