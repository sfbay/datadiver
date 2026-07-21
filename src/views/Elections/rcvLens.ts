// Leaf module (no React, no imports) — the RCV CVR skin's lens registry.
// Three lenses are the agreed next phase for RCV (memory `rcv-cvr-exploration`,
// approved 2026-07-20): REPLAY (round-by-round precinct playback), COALITION
// (transfer-flow analysis), WHAT-IF (strike-a-candidate re-tabulation). Only
// REPLAY ships in this pass — the other two are named here so the union type
// and any `?lens=` deep link are future-proof, but they aren't buildable yet.

export type RcvLens = 'replay' | 'coalition' | 'whatif'

export const ALL_LENSES: readonly RcvLens[] = ['replay', 'coalition', 'whatif']

/** Lenses with a shipped UI. Keep in sync as coalition/whatif land. */
export const SHIPPED_LENSES: readonly RcvLens[] = ['replay']

/** Parse a `?lens=` URL param into a lens, or null if it can't be shown.
 *
 *  Null covers TWO distinct cases on purpose:
 *   - unknown value (typo, garbage, stale link) — obviously null
 *   - a KNOWN lens that isn't shipped yet (e.g. 'coalition' today) — also
 *     null, so a deep link to an unbuilt lens degrades gracefully to the
 *     default view instead of rendering nothing or throwing. This is why
 *     the check consults SHIPPED_LENSES, not ALL_LENSES. */
export function parseLens(raw: string | null): RcvLens | null {
  if (raw === null) return null
  return (SHIPPED_LENSES as readonly string[]).includes(raw) ? (raw as RcvLens) : null
}
