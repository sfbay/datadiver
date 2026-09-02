// src/views/CrimeIncidents/categoryCard.ts
//
// Pure state for the crime view's "Category" stat card. Imports ONLY the
// zero-import subcategoryWatch leaf (for the authored merges); node-tested.
// The card follows the selection — categories, subcategories,
// AND the selected neighborhood/beat — and names its scope, so a reader with
// Assault checked never sees "Larceny Theft" as the headline (the old
// "Top Category" read a citywide date-only aggregate no matter what was on).
//
// Category counts DO NOT sum (a case can be charged under two categories),
// so a multi-select never prints a total — it names the leader and its rank.
// Subcategory ranks stay citywide because the movers queries are citywide
// (CLAUDE.md rule 1); the card says "citywide ranking" rather than claim an
// area count it never measured.

import { SUBCATEGORY_WATCH } from './subcategoryWatch'

/** Drop any selected pair key whose authored merge TARGET is also selected.
 *
 *  A chip click writes the target AND its merges into `?sub=` (a mover's
 *  `keys`), so one "Car break-ins" click selects two pair keys. Labeling
 *  every key would print "2 subcategories" for one click — and the second
 *  label is the raw SFPD string (`Theft From Vehicle`) the merge exists to
 *  hide. Mirrors foldSidebarCounts: a merged-away key whose target is NOT
 *  selected stands on its own, because it was selected on its own. */
export function foldSelectedSubKeys(keys: readonly string[]): string[] {
  const targetOf = new Map<string, string>()
  for (const [target, entry] of Object.entries(SUBCATEGORY_WATCH)) {
    for (const m of entry.merge ?? []) targetOf.set(m, target)
  }
  const selected = new Set(keys)
  return keys.filter((k) => {
    const target = targetOf.get(k)
    return !(target && selected.has(target))
  })
}

export interface CategoryCardInput {
  hasHistorical: boolean
  /** Citywide rows, ordered DESC by count (categoryRows). */
  citywide: Array<{ category: string; count: number }>
  /** Rows inside the selected area, ordered DESC (scopedCategoryRows), or [] when none selected. */
  scoped: Array<{ category: string; count: number }>
  /** True while the ACTIVE city's scoped aggregate is in flight (scopedCategoryLoading). */
  scopedLoading: boolean
  /** True while the citywide category aggregate is in flight (categoryLoading).
   *  useDataset keeps the previous rows during a refetch, so without this a
   *  date-range change would print the old range's rank and count. */
  citywideLoading: boolean
  /** Display label of the selected area, or null. */
  areaLabel: string | null
  /** Array.from(selectedCategories), display-ready (already formatted for Oakland by the caller). */
  selectedCategories: string[]
  /** Chip labels of selected subcategory pairs (subcategoryChipLabel), display-ready. */
  selectedSubLabels: string[]
  /** isSF/Oakland both true on desk; false on mobile and on historical. */
  canOpenPicker: boolean
  /** The aggregate's $limit (CATEGORY_ROW_CAP). A category missing from a
   *  list that HIT the cap is outside the ranking, not absent — "No cases"
   *  must never be printed from a truncated list. Absent = uncapped. */
  rowCap?: number
}

export interface CategoryCardState {
  value: string
  subtitle: string
  /** True when the subtitle should be a "Change →" action. */
  actionable: boolean
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function categoryCardState(i: CategoryCardInput): CategoryCardState {
  // 1. Historical: the archive published no filterable vocabulary, so the
  //    card names the citywide leader with no rank, no count, no action.
  //    "citywide" is literal: the historical aggregate carries no area
  //    clause (useCrimeEraData's histDateOnly), so under a selected area the
  //    card says which scope it is NOT following.
  if (i.hasHistorical) {
    return {
      value: i.citywideLoading ? '…' : (i.citywide[0]?.category ?? '—'),
      subtitle: 'Most reported citywide · categories as each era published them',
      actionable: false,
    }
  }

  const scopeWord = i.areaLabel ? `in ${i.areaLabel}` : 'citywide'
  const rows = i.areaLabel ? i.scoped : i.citywide
  const N = rows.length

  // 2. The scope's ranking is still in flight: say so. The previous scope's
  //    rows are still in hand during a refetch (useDataset keeps them), so an
  //    empty-rows check is NOT the test — switching Tenderloin → Mission would
  //    print Tenderloin's leader and count under Mission's name until Socrata
  //    answered. Loading is the test, whichever scope is on.
  if (i.areaLabel ? i.scopedLoading : i.citywideLoading) {
    return { value: '…', subtitle: `Ranking ${scopeWord}`, actionable: false }
  }

  const cats = i.selectedCategories
  // A list that filled its cap may have been cut, so a category it lacks is
  // "outside the top N", not "no cases".
  const capped = i.rowCap !== undefined && N >= i.rowCap

  // 4. Exactly one category (subs ignored): that category and its rank.
  if (cats.length === 1) {
    const cat = cats[0]
    const idx = rows.findIndex((r) => r.category === cat)
    return {
      value: cat,
      subtitle: idx >= 0
        ? `#${idx + 1} of ${N} · ${fmt(rows[idx].count)} ${scopeWord}`
        : capped
          ? `Outside the top ${N} ${scopeWord}`
          : `No cases ${scopeWord}`,
      actionable: i.canOpenPicker,
    }
  }

  // 5. Two or more: name the leader and its rank. Never a sum.
  if (cats.length >= 2) {
    let lead = cats[0]
    let leadIdx = -1
    for (const cat of cats) {
      const idx = rows.findIndex((r) => r.category === cat)
      if (idx >= 0 && (leadIdx < 0 || idx < leadIdx)) {
        lead = cat
        leadIdx = idx
      }
    }
    return {
      value: `${cats.length} selected`,
      subtitle: leadIdx >= 0 ? `${lead} leads · #${leadIdx + 1} ${scopeWord}` : `Selected ${scopeWord}`,
      actionable: i.canOpenPicker,
    }
  }

  // 6. Subcategories only: the movers are citywide by rule, so no area count.
  if (i.selectedSubLabels.length > 0) {
    const n = i.selectedSubLabels.length
    return {
      value: n === 1 ? i.selectedSubLabels[0] : `${n} subcategories`,
      subtitle: 'Subcategory filter · citywide ranking',
      actionable: i.canOpenPicker,
    }
  }

  // 3. Nothing selected: the scope's own leader. (One painted frame after an
  //    area is first selected, the just-enabled scoped query reports
  //    not-loading with no rows — useDataset flips isLoading inside its
  //    effect — so "No cases in <area>" can flash once. The row query is in
  //    the same state that frame and the tray is unmounted behind its
  //    skeleton, so it is not visible in practice.)
  const top = rows[0]
  return {
    value: top?.category ?? '—',
    subtitle: top ? `#1 of ${N} · ${fmt(top.count)} ${scopeWord}` : `No cases ${scopeWord}`,
    actionable: i.canOpenPicker,
  }
}
