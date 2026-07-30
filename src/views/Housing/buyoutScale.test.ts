import { describe, it, expect } from 'vitest'
import { buyoutRadius, parseAmount, BUYOUT_RADIUS_MIN, BUYOUT_RADIUS_MAX } from './buyoutScale'

describe('buyoutScale', () => {
  it('null/zero/negative amounts get the minimum radius', () => {
    expect(buyoutRadius(null)).toBe(BUYOUT_RADIUS_MIN)
    expect(buyoutRadius(0)).toBe(BUYOUT_RADIUS_MIN)
    expect(buyoutRadius(-5)).toBe(BUYOUT_RADIUS_MIN)
  })
  it('sqrt scale: median $40K lands mid-low, cap lands at max', () => {
    const r40k = buyoutRadius(40_000)
    expect(r40k).toBeGreaterThan(BUYOUT_RADIUS_MIN)
    expect(r40k).toBeLessThan((BUYOUT_RADIUS_MIN + BUYOUT_RADIUS_MAX) / 2)
    expect(buyoutRadius(470_000)).toBe(BUYOUT_RADIUS_MAX)
    expect(buyoutRadius(2_000_000)).toBe(BUYOUT_RADIUS_MAX) // clamped
  })
  it('parseAmount handles Socrata strings', () => {
    expect(parseAmount('40000')).toBe(40000)
    expect(parseAmount('469562.50')).toBe(469562.5)
    expect(parseAmount(undefined)).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})
