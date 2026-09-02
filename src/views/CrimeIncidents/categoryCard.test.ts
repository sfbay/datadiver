import { describe, it, expect } from 'vitest'
import { categoryCardState, foldSelectedSubKeys, type CategoryCardInput } from './categoryCard'
import { splitPairKey, subcategoryChipLabel } from './subcategoryWatch'

// The two live SFPD strings for vehicle break-ins; the second is authored to
// merge into the first (subcategoryWatch.ts), and a chip click writes BOTH.
const CAR_BREAK_INS = 'Larceny Theft|Larceny - From Vehicle'
const CAR_BREAK_INS_MERGED = 'Larceny Theft|Theft From Vehicle'

describe('foldSelectedSubKeys', () => {
  it('drops a merged-away key when its target is also selected', () => {
    expect(foldSelectedSubKeys([CAR_BREAK_INS, CAR_BREAK_INS_MERGED])).toEqual([CAR_BREAK_INS])
    expect(foldSelectedSubKeys([CAR_BREAK_INS_MERGED, CAR_BREAK_INS])).toEqual([CAR_BREAK_INS])
  })

  it('keeps a merged-away key selected on its own', () => {
    expect(foldSelectedSubKeys([CAR_BREAK_INS_MERGED])).toEqual([CAR_BREAK_INS_MERGED])
  })

  it('passes unrelated keys through in order', () => {
    const keys = ['Assault|Aggravated Assault', CAR_BREAK_INS, 'Robbery|Robbery - Street']
    expect(foldSelectedSubKeys(keys)).toEqual(keys)
  })

  it('one Car break-ins chip click labels as ONE subcategory on the card', () => {
    const labels = foldSelectedSubKeys([CAR_BREAK_INS, CAR_BREAK_INS_MERGED]).map((k) => {
      const { category, subcategory } = splitPairKey(k)
      return subcategoryChipLabel(category, subcategory)
    })
    expect(categoryCardState(input({ selectedSubLabels: labels }))).toEqual({
      value: 'Car break-ins', subtitle: 'Subcategory filter · citywide ranking', actionable: true,
    })
  })
})

const CITYWIDE = [
  { category: 'Larceny Theft', count: 21534 },
  { category: 'Other Miscellaneous', count: 6120 },
  { category: 'Malicious Mischief', count: 5011 },
  { category: 'Assault', count: 4402 },
]
const SCOPED = [
  { category: 'Assault', count: 812 },
  { category: 'Larceny Theft', count: 640 },
  { category: 'Drug Offense', count: 305 },
]

function input(over: Partial<CategoryCardInput> = {}): CategoryCardInput {
  return {
    hasHistorical: false,
    citywide: CITYWIDE,
    scoped: [],
    scopedLoading: false,
    citywideLoading: false,
    areaLabel: null,
    selectedCategories: [],
    selectedSubLabels: [],
    canOpenPicker: true,
    ...over,
  }
}

describe('categoryCardState', () => {
  it('rule 1 — historical: citywide leader, no rank, no count, no action', () => {
    expect(categoryCardState(input({
      hasHistorical: true, areaLabel: 'Tenderloin', scoped: SCOPED, selectedCategories: ['Assault'],
    }))).toEqual({
      value: 'Larceny Theft',
      subtitle: 'Most reported citywide · categories as each era published them',
      actionable: false,
    })
  })

  it('rule 2 — area selected and its ranking still loading reads as loading, not citywide', () => {
    expect(categoryCardState(input({ areaLabel: 'Tenderloin', scopedLoading: true }))).toEqual({
      value: '…', subtitle: 'Ranking in Tenderloin', actionable: false,
    })
  })

  it('rule 2 — a refetch with the PREVIOUS area\'s rows still in hand reads as loading, never as those rows', () => {
    // Tenderloin → Mission: useDataset keeps Tenderloin's rows while Mission's
    // query runs. Rows present + loading = loading; the old counts never
    // print under the new name.
    expect(categoryCardState(input({
      areaLabel: 'Mission', scoped: SCOPED, scopedLoading: true, selectedCategories: ['Assault'],
    }))).toEqual({
      value: '…', subtitle: 'Ranking in Mission', actionable: false,
    })
  })

  it('rule 2 — citywide ranking in flight (a date-range change) reads as loading', () => {
    expect(categoryCardState(input({ citywideLoading: true, selectedCategories: ['Assault'] }))).toEqual({
      value: '…', subtitle: 'Ranking citywide', actionable: false,
    })
    // With an area on, the citywide rows are not what the card reads.
    expect(categoryCardState(input({ areaLabel: 'Tenderloin', scoped: SCOPED, citywideLoading: true }))).toEqual({
      value: 'Assault', subtitle: '#1 of 3 · 812 in Tenderloin', actionable: true,
    })
  })

  it('rule 1 — historical leader in flight reads as loading, keeps the era note', () => {
    expect(categoryCardState(input({ hasHistorical: true, citywideLoading: true }))).toEqual({
      value: '…',
      subtitle: 'Most reported citywide · categories as each era published them',
      actionable: false,
    })
  })

  it('rule 3 — nothing selected: the citywide leader with rank and count', () => {
    expect(categoryCardState(input())).toEqual({
      value: 'Larceny Theft', subtitle: '#1 of 4 · 21,534 citywide', actionable: true,
    })
  })

  it('rule 3 — nothing selected inside an area: the area\'s own leader', () => {
    expect(categoryCardState(input({ areaLabel: 'Tenderloin', scoped: SCOPED }))).toEqual({
      value: 'Assault', subtitle: '#1 of 3 · 812 in Tenderloin', actionable: true,
    })
  })

  it('rule 3 — no rows at all says so', () => {
    expect(categoryCardState(input({ citywide: [] }))).toEqual({
      value: '—', subtitle: 'No cases citywide', actionable: true,
    })
  })

  it('rule 3 — canOpenPicker=false withholds the action', () => {
    expect(categoryCardState(input({ canOpenPicker: false }))).toEqual({
      value: 'Larceny Theft', subtitle: '#1 of 4 · 21,534 citywide', actionable: false,
    })
  })

  it('rule 4 — one category: that category and its rank in scope (subs ignored)', () => {
    expect(categoryCardState(input({
      selectedCategories: ['Assault'], selectedSubLabels: ['Car break-ins'],
    }))).toEqual({
      value: 'Assault', subtitle: '#4 of 4 · 4,402 citywide', actionable: true,
    })
  })

  it('rule 4 — one category with no cases in the area', () => {
    expect(categoryCardState(input({
      areaLabel: 'Tenderloin', scoped: SCOPED, selectedCategories: ['Malicious Mischief'],
    }))).toEqual({
      value: 'Malicious Mischief', subtitle: 'No cases in Tenderloin', actionable: true,
    })
  })

  it('rule 4 — a category missing from a list that HIT the cap is outside the ranking, not absent', () => {
    // Four rows against a cap of four: the list may have been cut.
    expect(categoryCardState(input({ selectedCategories: ['Vandalism'], rowCap: 4 }))).toEqual({
      value: 'Vandalism', subtitle: 'Outside the top 4 citywide', actionable: true,
    })
    expect(categoryCardState(input({
      areaLabel: 'Tenderloin', scoped: SCOPED, selectedCategories: ['Vandalism'], rowCap: 3,
    }))).toEqual({
      value: 'Vandalism', subtitle: 'Outside the top 3 in Tenderloin', actionable: true,
    })
    // Under the cap the list is complete, so absence is real.
    expect(categoryCardState(input({ selectedCategories: ['Vandalism'], rowCap: 400 }))).toEqual({
      value: 'Vandalism', subtitle: 'No cases citywide', actionable: true,
    })
  })

  it('rule 5 — two or more: the count selected and the leader\'s rank, never a sum', () => {
    expect(categoryCardState(input({
      selectedCategories: ['Assault', 'Malicious Mischief'],
    }))).toEqual({
      value: '2 selected', subtitle: 'Malicious Mischief leads · #3 citywide', actionable: true,
    })
  })

  it('rule 5 — two or more with none present in the area', () => {
    expect(categoryCardState(input({
      areaLabel: 'Tenderloin', scoped: SCOPED,
      selectedCategories: ['Malicious Mischief', 'Other Miscellaneous'],
    }))).toEqual({
      value: '2 selected', subtitle: 'Selected in Tenderloin', actionable: true,
    })
  })

  it('rule 6 — subcategories only: one label, or a count, and a citywide-ranking subtitle', () => {
    expect(categoryCardState(input({ selectedSubLabels: ['Car break-ins'] }))).toEqual({
      value: 'Car break-ins', subtitle: 'Subcategory filter · citywide ranking', actionable: true,
    })
    expect(categoryCardState(input({
      areaLabel: 'Tenderloin', scoped: SCOPED, selectedSubLabels: ['Car break-ins', 'Hit & Run'],
    }))).toEqual({
      value: '2 subcategories', subtitle: 'Subcategory filter · citywide ranking', actionable: true,
    })
  })
})
