// src/lib/trees/species.ts
// ZERO-IMPORT LEAF. The ONE parser for the inventory's `species` string and
// the ONE row classifier — imported by scripts/build-trees.ts and the view.
// Spec §10.1.3–§10.1.5. Rankings use the published string verbatim: nothing
// here merges cultivars or spellings.

export type RowKind = 'tree' | 'stump' | 'site' | 'shrub'

export interface ParsedSpecies {
  latin: string | null
  common: string | null
  /** False for NULL, blank, and the city's two placeholders. */
  recorded: boolean
}

const PLACEHOLDER = /^(tree\(s\)|to be determined?)$/i

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

/** Authored: every non-tree value the COMMON half took on Sept. 30, 2026. */
const NON_TREE: Readonly<Record<string, RowKind>> = {
  'stump': 'stump', 'stump (use grinder)': 'stump', 'stump (hand remove)': 'stump',
  'planting site': 'site', 'planting site (plant)': 'site', 'planting site (cut)': 'site', 'planting site (pave)': 'site',
  'shrub': 'shrub', 'private shrub': 'shrub',
}

const halves = (raw: string | null | undefined): string[] =>
  (raw ?? '').split('::').map((h) => h.trim().toLowerCase())

export function classifyRow(raw: string | null | undefined): RowKind {
  const h = halves(raw)
  // The common half decides: "Zelkova … (plant) :: Planting Site (plant)" is a site.
  return NON_TREE[h[h.length - 1]] ?? NON_TREE[h[0]] ?? 'tree'
}

const NON_TREE_WORD = /\b(stump|planting site|shrub|vacant|empty basin)\b/i

/** Strings that LOOK like a non-tree but are not in the authored list. */
export function unclassifiedNonTrees(strings: readonly string[]): string[] {
  return strings.filter((s) => NON_TREE_WORD.test(s) && classifyRow(s) === 'tree')
}
