// src/views/Trees/treesUrl.ts
//
// The Trees view's URL vocabulary — every param is view-owned (the view is
// dateless; useUrlSync never touches these). ZERO-IMPORT leaf, pure: a stale
// or junk value parses to the default or to null, never to a guess. Species
// and neighborhoods match a published string VERBATIM (no case folding — the
// rankings key on the city's own spelling).

export type Lens = 'explore' | 'equity' | 'safety'
export const LENSES: readonly Lens[] = ['explore', 'equity', 'safety']

export function parseLens(raw: string | null): Lens {
  return raw === 'equity' || raw === 'safety' ? raw : 'explore'
}

/** Equity ranking: street trees per 1,000 residents, or per square km. */
export type EquityRank = 'perK' | 'perKm2'

export function parseEquityRank(raw: string | null): EquityRank {
  return raw === 'perKm2' ? 'perKm2' : 'perK'
}

/** A site id (`treeid`): a positive integer of at most nine digits. */
export function parseTreeId(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d{0,8}$/.test(raw)) return null
  return Number(raw)
}

/** The published species string, exactly — or nothing. */
export function resolveSpecies(raw: string | null, names: readonly string[]): string | null {
  return raw !== null && names.includes(raw) ? raw : null
}

/** One of the loaded neighborhood names, exactly — or nothing. */
export function resolveNeighborhood(raw: string | null, names: readonly string[]): string | null {
  return raw !== null && names.includes(raw) ? raw : null
}
