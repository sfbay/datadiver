// src/views/Trees/exploreRows.ts
//
// The Explore tab's pure logic: the species filter, the address prefix
// clause for the live search, which ranking rows are drawn, and the two
// figures a row or the species card turns into marks. ZERO-IMPORT leaf
// (type-only import), node-tested in exploreRows.test.ts.

import type { SpeciesAggregate } from '@/lib/trees/types'

/** Case-insensitive substring over the Latin and common names; an empty or
 *  blank query keeps every row. Rank order is the input's — never re-sorted. */
export function filterSpecies(rows: readonly SpeciesAggregate[], query: string): SpeciesAggregate[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows.slice()
  return rows.filter((r) => {
    const latin = r.latin?.toLowerCase() ?? ''
    const common = r.common?.toLowerCase() ?? ''
    if (!latin && !common) return r.name.toLowerCase().includes(q)
    return latin.includes(q) || common.includes(q)
  })
}

/** The live address search's `$where`: a PREFIX match on the inventory's
 *  `description` line ("1215 35th Ave | Tree 1"). Null unless the query
 *  starts with a house number followed by a word, and is at least four
 *  characters — a bare number or a street name alone would scan the city.
 *  LIKE wildcards are stripped (the reader types text, not a pattern),
 *  quotes doubled, spaces collapsed to the published single space. */
export function addressPrefixWhere(query: string): string | null {
  const q = query.replace(/[%_]/g, '').replace(/\s+/g, ' ').trim()
  if (q.length < 4 || !/^\d+\s+\S/.test(q)) return null
  return `upper(description) like '${q.toUpperCase().replace(/'/g, "''")}%'`
}

/** The ranking rows drawn: the first `limit`, or all; a selected species
 *  past the cut is appended so the expanded card is never hidden. A
 *  selection the rows do not hold (filtered out) adds nothing. */
export function visibleSpecies(
  rows: readonly SpeciesAggregate[], showAll: boolean, selected: string | null, limit: number,
): SpeciesAggregate[] {
  if (showAll || rows.length <= limit) return rows.slice()
  const head = rows.slice(0, limit)
  if (selected === null || head.some((r) => r.name === selected)) return head
  const pick = rows.find((r) => r.name === selected)
  return pick ? [...head, pick] : head
}

/** A share of street trees, one decimal. A share that rounds to zero but is
 *  not zero reads "<0.1%" — never "0.0%", which claims none. */
export function sharePercent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0%'
  const pct = (count / total) * 100
  if (pct < 0.05) return '<0.1%'
  return `${Math.round(pct * 10) / 10}%`
}

/** A ranking bar's length as a fraction of rank 1's count; a non-zero count
 *  keeps a sliver so a one-tree species still shows a mark. */
export function barShare(count: number, top: number): number {
  if (top <= 0 || count <= 0) return 0
  return Math.min(1, Math.max(0.01, count / top))
}
