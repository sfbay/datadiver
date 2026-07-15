import { describe, it, expect } from 'vitest'
import { shiftYearsStr, rollupToSectors, computeClosureZ } from './sectorClosureBaseline'

describe('shiftYearsStr', () => {
  it('shifts the year component as a pure string op (no TZ)', () => {
    expect(shiftYearsStr('2026-07-15', 1)).toBe('2025-07-15')
    expect(shiftYearsStr('2026-07-15', 5)).toBe('2021-07-15')
  })
  it('clamps Feb 29 to Feb 28 on non-leap targets', () => {
    expect(shiftYearsStr('2024-02-29', 1)).toBe('2023-02-28')
  })
})

describe('rollupToSectors', () => {
  it('rolls 3-digit prefixes into sectors including Uncategorized for null p3', () => {
    const m = rollupToSectors([
      { p3: '722', cnt: '10' },
      { p3: '721', cnt: '5' },
      { cnt: '40' }, // null code bucket
    ])
    expect(m.get('Food Services')).toBe(10)
    expect(m.get('Accommodations')).toBe(5)
    expect(m.get('Uncategorized')).toBe(40)
  })
})

describe('computeClosureZ', () => {
  it('computes z per sector from matched-window samples', () => {
    const current = new Map([['Food Services', 20]])
    const samples = [
      new Map([['Food Services', 10]]),
      new Map([['Food Services', 12]]),
      new Map([['Food Services', 8]]),
      new Map([['Food Services', 10]]),
      new Map([['Food Services', 10]]),
    ]
    const z = computeClosureZ(current, samples)
    expect(z.get('Food Services')!).toBeGreaterThan(2) // 20 vs mean 10
  })
  it('omits sectors whose baseline has zero variance', () => {
    const current = new Map([['Information', 3]])
    const samples = Array.from({ length: 5 }, () => new Map([['Information', 3]]))
    expect(computeClosureZ(current, samples).has('Information')).toBe(false)
  })
  it('treats a sector missing from a sample window as 0 closures', () => {
    const current = new Map([['Construction', 6]])
    const samples = [new Map([['Construction', 4]]), new Map(), new Map([['Construction', 2]]), new Map(), new Map()]
    expect(computeClosureZ(current, samples).get('Construction')).toBeDefined()
  })
})
