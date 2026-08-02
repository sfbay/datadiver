import { describe, it, expect } from 'vitest'
import { annualizedRatePer1k, formatRate, MIN_RENTER_HOUSEHOLDS } from './evictionRate'

describe('annualizedRatePer1k', () => {
  it('reproduces the citywide 2025 figure: 1,495 notices over a full year', () => {
    const rate = annualizedRatePer1k(1495, 223_040, 365.25)
    expect(rate).toBeCloseTo(6.7, 1)
  })
  it('annualizes short windows onto the same scale', () => {
    // 100 notices in 30 days ≈ 1,217/yr → ~5.46 per 1K citywide
    const rate = annualizedRatePer1k(100, 223_040, 30)
    expect(rate).toBeCloseTo(5.46, 1)
  })
  it('suppresses below the renter-household floor (parks, piers)', () => {
    expect(annualizedRatePer1k(5, MIN_RENTER_HOUSEHOLDS - 1, 365)).toBeNull()
    expect(annualizedRatePer1k(5, undefined, 365)).toBeNull()
  })
  it('guards degenerate inputs', () => {
    expect(annualizedRatePer1k(null, 10_000, 365)).toBeNull()
    expect(annualizedRatePer1k(10, 10_000, 0)).toBeNull()
    expect(annualizedRatePer1k(-1, 10_000, 365)).toBeNull()
  })
})

describe('formatRate', () => {
  it('one decimal at ≥1, two below', () => {
    expect(formatRate(6.7123)).toBe('6.7')
    expect(formatRate(0.4234)).toBe('0.42')
  })
})
