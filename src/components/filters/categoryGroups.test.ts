import { describe, it, expect } from 'vitest'
import { availableInGroup } from './categoryGroups'

describe('availableInGroup', () => {
  it('intersects authored group members with the loaded vocabulary', () => {
    expect(availableInGroup(['A', 'B', 'C'], new Set(['B', 'C', 'D']))).toEqual(['B', 'C'])
  })
  it('returns [] when nothing matches — the disabled-button case', () => {
    expect(availableInGroup(['Larceny Theft'], new Set(['STOLEN VEHICLE']))).toEqual([])
  })
})
