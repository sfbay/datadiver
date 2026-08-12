import type { CityAreas, CityConfig } from './types'

/**
 * The composed area label — the ONE way name + code meet in a string
 * (spec decision 6: the human name leads, the code stays visible).
 * SF (no displayName): identity — 'Mission' stays 'Mission'.
 * Oakland: 'Rockridge & Shafter · 12Y'; unmapped codes (77X/99X)
 * compose as 'Unmapped beat · 77X'.
 * Truncating containers must NOT use this string — they render name and
 * code as separate spans so the code survives clipping (see AreaLabel.tsx).
 */
export function composeAreaLabel(areas: CityAreas, id: string): string {
  return areas.displayName ? `${areas.displayName(id)} · ${id}` : id
}

/**
 * Display label for a COARSE CENSUS UNIT — the tier the Demographics
 * explorer paints. A two-geography city (Oakland) keys its ACS rows by
 * region CODE and carries authored names for them; a single-spine city
 * (SF) has no separate census geography, so the unit's own name IS the
 * label. Either way the id stays canonical in state, URLs and joins —
 * this is display only, exactly as composeAreaLabel is for `areas`.
 *
 * An unknown id returns the id, never a neighbouring place's name: a
 * wrong label is worse than a bare code.
 */
export function censusUnitLabel(city: CityConfig, id: string): string {
  return city.census?.regions?.names[id] ?? id
}

/** What to CALL a coarse census unit in prose — '10 regions' vs
 *  '41 neighborhoods'. A two-geography city must NOT borrow its `areas`
 *  noun here: Oakland's census tier is regions, not police beats. */
export function censusUnitNoun(city: CityConfig): { one: string; many: string } {
  return city.census?.regions
    ? { one: 'region', many: 'regions' }
    : { one: city.areas.noun, many: city.areas.nounPlural }
}

/** Detail-panel tooltip disclosing the labels' provenance (spec §A7 —
 *  disclosure ships WITH the labels, never a PR behind them). */
export const BEAT_NAME_DISCLOSURE =
  "Beat names are DataDiver's synthesis of the City's official neighborhood " +
  'boundaries and community policing names — see About for the method.'
