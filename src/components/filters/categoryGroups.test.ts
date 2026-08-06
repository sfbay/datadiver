import { describe, it, expect } from 'vitest'
import { availableInGroup, groupDisabled } from './categoryGroups'

describe('availableInGroup', () => {
  it('intersects authored group members with the loaded vocabulary', () => {
    expect(availableInGroup(['A', 'B', 'C'], new Set(['B', 'C', 'D']))).toEqual(['B', 'C'])
  })
  it('returns [] when nothing matches — the disabled-button case', () => {
    expect(availableInGroup(['Larceny Theft'], new Set(['STOLEN VEHICLE']))).toEqual([])
  })
})

describe('groupDisabled', () => {
  // Before categories load, every group must render enabled — a zero-length
  // categories list means NO group renders disabled, even when the
  // intersection is (trivially) empty. This is the transient-flash guard.
  it('never disables before categories have loaded, even with an empty intersection', () => {
    expect(groupDisabled(false, [])).toBe(false)
  })
  it('disables once categories have loaded and the intersection is empty', () => {
    expect(groupDisabled(true, [])).toBe(true)
  })
})
