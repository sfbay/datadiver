import { describe, it, expect } from 'vitest'
import { categoryCardState, type CategoryCardInput } from './categoryCard'

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
      subtitle: 'Most reported · categories as each era published them',
      actionable: false,
    })
  })

  it('rule 2 — area selected and its ranking still loading reads as loading, not citywide', () => {
    expect(categoryCardState(input({ areaLabel: 'Tenderloin', scopedLoading: true }))).toEqual({
      value: '…', subtitle: 'Ranking in Tenderloin', actionable: false,
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
