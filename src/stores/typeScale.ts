// src/stores/typeScale.ts
//
// Pure hydration logic for the type-scale preference, split out of
// appStore.ts so it's unit-testable under this project's node-only Vitest
// config (`vitest.config.ts`: `environment: 'node' // pure functions only —
// no DOM needed`). appStore.ts touches `window.matchMedia`/`localStorage`
// at module-eval time (same as the existing isDarkMode/isSidebarOpen
// fields), which makes the store module itself unimportable in a test
// without a DOM — this leaf module has neither dependency, so it can be.
//
// String union (not boolean) so the 'xl' tier — added Phase 1.5 per
// Jesse's feedback that 'large' alone didn't go far enough — needed no
// migration, same rationale as ComparisonMode in utils/comparisonMode.ts.

export type TypeScale = 'default' | 'large' | 'xl'

const VALID_SCALES: TypeScale[] = ['default', 'large', 'xl']

/** Parse the raw localStorage value into a valid TypeScale, defaulting to
 *  'default' for anything else (null/unset, or a stale value left behind
 *  by a rolled-back or renamed tier) — mirrors isSidebarOpen's
 *  tri-state-safe `!== 'collapsed'` comparison in appStore.ts, just
 *  phrased as an allow-list instead of a deny-list since this is a 3-way
 *  union rather than a boolean. */
export function parseTypeScale(raw: string | null): TypeScale {
  return VALID_SCALES.includes(raw as TypeScale) ? (raw as TypeScale) : 'default'
}
