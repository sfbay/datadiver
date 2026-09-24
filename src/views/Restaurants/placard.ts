// src/views/Restaurants/placard.ts
//
// SF's green / yellow / red placard, normalized across the two eras that
// publish it. ZERO-IMPORT pure leaf.
//
//   2020–23 (5tti-66ds `facility_status`): upper-case, with misspellings —
//     CONDITIIONAL PASS ×11, CONDITIONA PASS ×1, CONDITONAL PASS ×1 beside
//     CONDITIONAL PASS ×6,145 (probed live 2026-09-24; spec §6). Every CONDI*
//     spelling is a Conditional Pass.
//   2024+ (tvy3-wexg `facility_rating_status`): 'Pass' / 'Conditional Pass' /
//     'Closure', plus 1,617 NULL rows (no placard recorded — never read as Pass).
//
// The 2016–19 era (pyih-qa8i) published a numeric SCORE, not a placard; it is
// never converted into one (spec §6).

export type Placard = 'pass' | 'conditional' | 'closure'

/** Worst first — the rank a map layer or a same-day tie resolves by. */
export const PLACARD_ORDER: readonly Placard[] = ['closure', 'conditional', 'pass']

/** Higher = worse. */
export const PLACARD_RANK: Readonly<Record<Placard, number>> = { pass: 0, conditional: 1, closure: 2 }

/** Placard pigments (spec D7): moss-500 / ochre-500 / brick-600. The view's
 *  own chrome stays teal-700 so the chrome never reads as a verdict. */
export const PLACARD_COLOR: Readonly<Record<Placard, string>> = {
  pass: '#7a9954', // moss-500
  conditional: '#d4a435', // ochre-500
  closure: '#963e30', // brick-600
}

/** Reader-facing placard words — the colors DPH posts on the door. */
export const PLACARD_WORD: Readonly<Record<Placard, string>> = {
  pass: 'green placard',
  conditional: 'yellow placard',
  closure: 'closed',
}

/** Chip labels (the city's own terms). */
export const PLACARD_LABEL: Readonly<Record<Placard, string>> = {
  pass: 'Pass',
  conditional: 'Conditional pass',
  closure: 'Closure',
}

/** Any published status string → a placard, or null when none was recorded
 *  or the string is not a placard. Case- and whitespace-insensitive; every
 *  CONDI* spelling of "conditional" is a conditional pass. */
export function normalizePlacard(raw: string | null | undefined): Placard | null {
  if (!raw) return null
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  if (s === 'PASS') return 'pass'
  if (s === 'CLOSURE' || s === 'CLOSED') return 'closure'
  if (/^CONDI\S* PASS$/.test(s)) return 'conditional'
  return null
}

/** The worse of two placards (null loses to any placard). */
export function worsePlacard(a: Placard | null, b: Placard | null): Placard | null {
  if (a === null) return b
  if (b === null) return a
  return PLACARD_RANK[a] >= PLACARD_RANK[b] ? a : b
}

/** `?placard=` → a filter, or null. Only the two non-pass readings filter. */
export function parsePlacardFilter(raw: string | null | undefined): 'closure' | 'conditional' | null {
  return raw === 'closure' || raw === 'conditional' ? raw : null
}

/** The tvy3-wexg literal for a placard — what a SoQL filter compares against. */
export const PLACARD_TVY3_VALUE: Readonly<Record<Placard, string>> = {
  pass: 'Pass',
  conditional: 'Conditional Pass',
  closure: 'Closure',
}
