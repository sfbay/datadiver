// src/views/CrimeIncidents/categoryCard.ts
//
// Pure state for the crime view's "Category" stat card. ZERO app imports;
// node-tested. The card follows the selection — categories, subcategories,
// AND the selected neighborhood/beat — and names its scope, so a reader with
// Assault checked never sees "Larceny Theft" as the headline (the old
// "Top Category" read a citywide date-only aggregate no matter what was on).
//
// Category counts DO NOT sum (a case can be charged under two categories),
// so a multi-select never prints a total — it names the leader and its rank.
// Subcategory ranks stay citywide because the movers queries are citywide
// (CLAUDE.md rule 1); the card says "citywide ranking" rather than claim an
// area count it never measured.

export interface CategoryCardInput {
  hasHistorical: boolean
  /** Citywide rows, ordered DESC by count (categoryRows). */
  citywide: Array<{ category: string; count: number }>
  /** Rows inside the selected area, ordered DESC (scopedCategoryRows), or [] when none selected. */
  scoped: Array<{ category: string; count: number }>
  scopedLoading: boolean
  /** Display label of the selected area, or null. */
  areaLabel: string | null
  /** Array.from(selectedCategories), display-ready (already formatted for Oakland by the caller). */
  selectedCategories: string[]
  /** Chip labels of selected subcategory pairs (subcategoryChipLabel), display-ready. */
  selectedSubLabels: string[]
  /** isSF/Oakland both true on desk; false on mobile and on historical. */
  canOpenPicker: boolean
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
  if (i.hasHistorical) {
    return {
      value: i.citywide[0]?.category ?? '—',
      subtitle: 'Most reported · categories as each era published them',
      actionable: false,
    }
  }

  const scopeWord = i.areaLabel ? `in ${i.areaLabel}` : 'citywide'
  const rows = i.areaLabel ? i.scoped : i.citywide
  const N = rows.length

  // 2. Area selected, its ranking still in flight: say so, don't fall back
  //    to the citywide rows under a subtitle that names the area.
  if (i.areaLabel && i.scopedLoading && i.scoped.length === 0) {
    return { value: '…', subtitle: `Ranking ${scopeWord}`, actionable: false }
  }

  const cats = i.selectedCategories

  // 4. Exactly one category (subs ignored): that category and its rank.
  if (cats.length === 1) {
    const cat = cats[0]
    const idx = rows.findIndex((r) => r.category === cat)
    return {
      value: cat,
      subtitle: idx >= 0
        ? `#${idx + 1} of ${N} · ${fmt(rows[idx].count)} ${scopeWord}`
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

  // 3. Nothing selected: the scope's own leader.
  const top = rows[0]
  return {
    value: top?.category ?? '—',
    subtitle: top ? `#1 of ${N} · ${fmt(top.count)} ${scopeWord}` : `No cases ${scopeWord}`,
    actionable: i.canOpenPicker,
  }
}
