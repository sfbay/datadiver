// Leaf module (no React, no imports) — the RCV CVR skin's lens registry.
// Three lenses are the agreed next phase for RCV (memory `rcv-cvr-exploration`,
// approved 2026-07-20): REPLAY (round-by-round precinct playback), COALITION
// (transfer-flow analysis), WHAT-IF (strike-a-candidate re-tabulation). REPLAY
// and COALITION ship in this pass — WHAT-IF is named here so the union type
// and any `?lens=` deep link are future-proof, but it isn't buildable yet.

export type RcvLens = 'replay' | 'coalition' | 'whatif'

export const ALL_LENSES: readonly RcvLens[] = ['replay', 'coalition', 'whatif']

/** Lenses with a shipped UI. Keep in sync as whatif lands. */
export const SHIPPED_LENSES: readonly RcvLens[] = ['replay', 'coalition']

/** Parse a `?lens=` URL param into a lens, or null if it can't be shown.
 *
 *  Null covers TWO distinct cases on purpose:
 *   - unknown value (typo, garbage, stale link) — obviously null
 *   - a KNOWN lens that isn't shipped yet (e.g. 'whatif' today) — also
 *     null, so a deep link to an unbuilt lens degrades gracefully to the
 *     default view instead of rendering nothing or throwing. This is why
 *     the check consults SHIPPED_LENSES, not ALL_LENSES. */
export function parseLens(raw: string | null): RcvLens | null {
  if (raw === null) return null
  return (SHIPPED_LENSES as readonly string[]).includes(raw) ? (raw as RcvLens) : null
}
