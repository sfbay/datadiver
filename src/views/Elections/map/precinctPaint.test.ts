import { describe, expect, it } from 'vitest'
import {
  decisivenessOpacity,
  isProposition,
  leaderOf,
  marginFill,
  propFill,
  resultsFill,
  turnoutFill,
} from './precinctPaint'

describe('leaderOf', () => {
  it('returns the leader with share and lead as fractions of total', () => {
    const l = leaderOf({ 'A\n(DEM)': 60, 'B\n(REP)': 30, C: 10 })
    expect(l).toEqual({ name: 'A', share: 0.6, lead: 0.3 })
  })
  it('is null for a zero-vote precinct', () => {
    expect(leaderOf({})).toBeNull()
    expect(leaderOf({ A: 0, B: 0 })).toBeNull()
  })
  it('single candidate: share = 1, lead = 1', () => {
    expect(leaderOf({ ONLY: 5 })).toEqual({ name: 'ONLY', share: 1, lead: 1 })
  })
  it('an exact tie is deterministic and reads as lead 0', () => {
    const l = leaderOf({ A: 10, B: 10 })
    expect(l?.lead).toBe(0)
    expect(['A', 'B']).toContain(l?.name)
  })
})

describe('decisivenessOpacity — four steps, exact boundaries', () => {
  it.each([
    [0.3, 0.25],
    [0.34, 0.4],   // boundary belongs to the step above
    [0.49, 0.4],
    [0.5, 0.55],
    [0.64, 0.55],
    [0.65, 0.7],
    [0.9, 0.7],
  ])('share %f → %f', (share, opacity) => {
    expect(decisivenessOpacity(share)).toBe(opacity)
  })
})

describe('fill functions', () => {
  it('resultsFill uses the leader color and steps opacity by share', () => {
    const map = new Map([['A', '#616a96']])
    expect(resultsFill({ name: 'A', share: 0.7, lead: 0.4 }, map)).toEqual({
      color: '#616a96',
      opacity: 0.7,
    })
  })
  it('resultsFill falls back to paper for unmatched names', () => {
    expect(resultsFill({ name: 'X', share: 0.4, lead: 0.1 }, new Map()).color).toBe('#a8926a')
  })
  it('propFill midpoint is warm paper, never white (cream-invisibility regression)', () => {
    const mid = propFill(0.5)
    expect(mid.color.toLowerCase()).toBe('#d9c9a7')
    expect(mid.opacity).toBe(0.55)
  })
  it('turnoutFill and marginFill carry fixed 0.55 opacity', () => {
    expect(turnoutFill(0.74).opacity).toBe(0.55)
    expect(marginFill(0.2).opacity).toBe(0.55)
  })
})

describe('isProposition', () => {
  it('matches both slug and title forms across eras', () => {
    expect(isProposition('proposition-2', 'PROPOSITION 2')).toBe(true)
    expect(isProposition('measure-a', 'MEASURE A')).toBe(true)
    expect(isProposition('mayor', 'MAYOR')).toBe(false)
  })
})
