// src/components/charts/dorlingLabel.ts
//
// Pure label-fit math for DorlingCartogram, split out so the fit rules are
// unit-testable under the node-only Vitest config (the chart itself needs DOM).
//
// Why a formula, not a flat bump (Large Type Phase 3): a Dorling label must
// fit INSIDE its circle, whose radius is layout-computed in px and does NOT
// grow with the root font-size. Font sizes are emitted in rem (the root %
// scales the rendered glyphs), so at large/xl the same rem value paints more
// px — the budget the circle can spend on characters shrinks. `factor` (the
// root multiplier from SCALE_FACTORS) therefore RAISES the show gates and
// SHRINKS the char budget in step with the glyph growth. At factor 1 every
// value is identical to the pre-Phase-3 inline formulas.

export interface DorlingLabelSpec {
  /** Show the name label at all? (legacy gate: r > 18) */
  showName: boolean
  /** Name font-size as a rem string — the root scale applies the growth */
  nameFontRem: string
  /** Truncation budget for the name (legacy: floor(r * 0.38)) */
  nameMaxChars: number
  /** Show the population sub-label? (legacy gate: r > 25) */
  showPop: boolean
  popFontRem: string
}

export function dorlingLabel(r: number, factor: number): DorlingLabelSpec {
  return {
    showName: r > 18 * factor,
    nameFontRem: `${Math.min(11, r * 0.42) / 16}rem`,
    nameMaxChars: Math.floor((r * 0.38) / factor),
    showPop: r > 25 * factor,
    popFontRem: `${Math.min(9, r * 0.3) / 16}rem`,
  }
}
