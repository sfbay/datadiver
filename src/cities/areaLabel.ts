import type { CityAreas } from './types'

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

/** Detail-panel tooltip disclosing the labels' provenance (spec §A7 —
 *  disclosure ships WITH the labels, never a PR behind them). */
export const BEAT_NAME_DISCLOSURE =
  "Beat names are DataDiver's synthesis of the City's official neighborhood " +
  'boundaries and community policing names — see About for the method.'
