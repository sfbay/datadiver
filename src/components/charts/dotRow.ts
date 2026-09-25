// src/components/charts/dotRow.ts
//
// Pure spec for DotRow: "N things, of which M are one way and K are marked".
// ZERO-IMPORT leaf, node-tested. The three sentences it replaces on the
// Restaurants view all had this shape — "closures across 21 of its 31
// storefronts on the map", "19 locations · 12 owners" — a count, a subset,
// and a highlight, which a row of dots says at a glance.

export type Dot = 'filled' | 'hollow' | 'accent'

export interface DotRowSpec {
  dots: Dot[]
  /** Dots not drawn because `total` exceeded `cap`; the caller prints "+N". */
  overflow: number
}

/** `total` dots: the first `filled` are solid, the rest hollow; `accent`
 *  indices (0-based) are re-marked in the accent colour. Past `cap` the row
 *  truncates and reports the remainder so it never wraps into a second
 *  line that reads as a second row. */
export function dotRowSpec(
  total: number,
  filled: number,
  accent: readonly number[] = [],
  cap = 40,
): DotRowSpec {
  const n = Math.max(0, Math.floor(total))
  const shown = Math.min(n, cap)
  const f = Math.max(0, Math.min(shown, Math.floor(filled)))
  const dots: Dot[] = Array.from({ length: shown }, (_, i) => (i < f ? 'filled' : 'hollow'))
  for (const i of accent) if (i >= 0 && i < shown) dots[i] = 'accent'
  return { dots, overflow: n - shown }
}
