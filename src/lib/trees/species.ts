// src/lib/trees/species.ts
// ZERO-IMPORT LEAF. The ONE parser for the inventory's `species` string and
// the ONE row classifier — imported by scripts/build-trees.ts and the view.
// Spec §10.1.3–§10.1.5. Rankings use the published string verbatim: nothing
// here merges cultivars or spellings.

export type RowKind = 'tree' | 'stump' | 'site' | 'shrub'

export interface ParsedSpecies {
  latin: string | null
  common: string | null
  /** False for NULL, blank, and the city's placeholders (incl. `Other :: Other`, ruling R4). */
  recorded: boolean
}

// Ruling R4 (Sept. 30, 2026): `Other :: Other` is a TREE whose species is not
// recorded — `other` is a placeholder on either half.
const PLACEHOLDER = /^(tree\(s\)|to be determined?|other)$/i

export function parseSpecies(raw: string | null | undefined): ParsedSpecies {
  const s = (raw ?? '').trim()
  if (!s) return { latin: null, common: null, recorded: false }
  let a = s
  let b = ''
  const dbl = s.indexOf('::')
  if (dbl >= 0) {
    a = s.slice(0, dbl); b = s.slice(dbl + 2)
  } else {
    // The removal-notice dataset separates with " : " (one colon, spaced).
    const one = s.indexOf(' : ')
    if (one >= 0) { a = s.slice(0, one); b = s.slice(one + 3) }
  }
  const clean = (x: string) => { const t = x.trim(); return t && !PLACEHOLDER.test(t) ? t : null }
  const latin = clean(a)
  const common = clean(b)
  return { latin, common, recorded: latin !== null || common !== null }
}

export function speciesLabel(p: ParsedSpecies): string {
  return p.common ?? p.latin ?? 'Species not recorded'
}

/**
 * Authored: every non-tree value either half took on Sept. 30, 2026, matched
 * case-folded. Ruling R5 added the empty-site leftovers: potential sites,
 * paved-over and paved-temporary sites, and empty basins.
 */
const NON_TREE: Readonly<Record<string, RowKind>> = {
  'stump': 'stump', 'stump (use grinder)': 'stump', 'stump (hand remove)': 'stump',
  'planting site': 'site', 'planting site (plant)': 'site', 'planting site (cut)': 'site', 'planting site (pave)': 'site',
  'potential site': 'site', 'paved over': 'site', 'pave': 'site', 'paved': 'site',
  'paved temp': 'site', 'pavedtemp': 'site', 'basin(s)': 'site',
  'shrub': 'shrub', 'private shrub': 'shrub',
}

/**
 * Authored: corrupt WHOLE strings (no usable separator) that are non-trees —
 * matched against the entire case-folded string, never a half (ruling R5).
 */
const NON_TREE_EXACT: Readonly<Record<string, RowKind>> = {
  'lophostemon confertusting site': 'site',
}

const halves = (raw: string | null | undefined): string[] =>
  (raw ?? '').split('::').map((h) => h.trim().toLowerCase())

export function classifyRow(raw: string | null | undefined): RowKind {
  const exact = NON_TREE_EXACT[(raw ?? '').trim().toLowerCase()]
  if (exact) return exact
  const h = halves(raw)
  // The common half decides: "Zelkova … (plant) :: Planting Site (plant)" is a site.
  return NON_TREE[h[h.length - 1]] ?? NON_TREE[h[0]] ?? 'tree'
}

/** Ruling R6: any of these as a word makes a string suspect — every word in
 *  the list with its plural (empty → empties, vacant → vacants, pave → paves). */
const NON_TREE_WORD =
  /\b(stumps?|sites?|shrubs?|vacants?|empty|empties|basins?|paves?|paved|pavedtemps?|potentials?|others?|unknowns?)\b/i

/**
 * Authored: strings that carry a suspect word but ARE trees (case-folded
 * whole string). `Other :: Other` is a tree with no recorded species (R4);
 * the two palms are trees ranked under their published names (R9).
 */
const TREE_DESPITE_WORD: ReadonlySet<string> = new Set([
  'other :: other',
  'palm (unknown genus) :: palm spp',
  'phoenix spp :: date palm (species unknown)',
])

/** Strings that LOOK like a non-tree but are classed as trees without an authored reason. */
export function unclassifiedNonTrees(strings: readonly string[]): string[] {
  return strings.filter((s) =>
    NON_TREE_WORD.test(s) && classifyRow(s) === 'tree' && !TREE_DESPITE_WORD.has(s.trim().toLowerCase()))
}
