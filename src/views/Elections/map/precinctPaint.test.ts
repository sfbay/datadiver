import { describe, expect, it } from 'vitest'
import {
  decisivenessOpacity,
  decisivenessOpacityRelative,
  focusFill,
  isProposition,
  leaderOf,
  leaderShareQuartiles,
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

describe('leaderShareQuartiles — race-relative decisiveness ladder', () => {
  it('computes quartile boundaries of a known 12-value array (shuffled input)', () => {
    const shares = [0.7, 0.2, 0.9, 0.4, 0.1, 0.6, 0.99, 0.3, 0.5, 0.95, 0.8, 0.85]
    // sorted: 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.85 0.9 0.95 0.99
    // q(0.25)=s[3]=0.4  q(0.5)=s[6]=0.7  q(0.75)=s[9]=0.9
    expect(leaderShareQuartiles(shares)).toEqual([0.4, 0.7, 0.9])
  })

  it('fewer than 8 values → null (absolute fallback)', () => {
    expect(leaderShareQuartiles([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])).toBeNull()
  })

  it('degenerate spread (all equal) → null (absolute fallback)', () => {
    expect(leaderShareQuartiles(Array(10).fill(0.5))).toBeNull()
  })
})

describe('decisivenessOpacityRelative — race-relative boundaries', () => {
  const q: [number, number, number] = [0.4, 0.7, 0.9]
  it('share below q1 → 0.25', () => {
    expect(decisivenessOpacityRelative(0.3, q)).toBe(0.25)
  })
  it('share at q3 (not below it) → top step 0.7', () => {
    expect(decisivenessOpacityRelative(0.9, q)).toBe(0.7)
  })
  it('share between q1 and q2 → 0.4; between q2 and q3 → 0.55', () => {
    expect(decisivenessOpacityRelative(0.5, q)).toBe(0.4)
    expect(decisivenessOpacityRelative(0.8, q)).toBe(0.55)
  })
})

describe('focusFill — race-relative continuous single-hue ramp', () => {
  it('maps the extent min to opacity 0.12 and max to 0.75', () => {
    expect(focusFill(0.2, [0.2, 0.8], '#616a96')).toEqual({ color: '#616a96', opacity: 0.12 })
    expect(focusFill(0.8, [0.2, 0.8], '#616a96')).toEqual({ color: '#616a96', opacity: 0.75 })
  })
  it('degenerate extent (min === max) falls back to the midpoint 0.435', () => {
    expect(focusFill(0.5, [0.5, 0.5], '#616a96').opacity).toBeCloseTo(0.435, 5)
  })
})

describe('resultsFill — optional quartiles arg (backwards compatible)', () => {
  it('with quartiles: uses the race-relative ladder', () => {
    const map = new Map([['A', '#616a96']])
    const q: [number, number, number] = [0.4, 0.7, 0.9]
    // 0.6 is absolute-step 0.55 but relative-step 0.4 (below q2=0.7)
    expect(resultsFill({ name: 'A', share: 0.6, lead: 0.2 }, map, q)).toEqual({
      color: '#616a96',
      opacity: 0.4,
    })
  })
  it('without quartiles: stays on the absolute ladder (existing behavior)', () => {
    const map = new Map([['A', '#616a96']])
    expect(resultsFill({ name: 'A', share: 0.6, lead: 0.2 }, map)).toEqual({
      color: '#616a96',
      opacity: 0.55,
    })
  })
  it('null quartiles (degenerate race) also falls back to absolute', () => {
    const map = new Map([['A', '#616a96']])
    expect(resultsFill({ name: 'A', share: 0.6, lead: 0.2 }, map, null)).toEqual({
      color: '#616a96',
      opacity: 0.55,
    })
  })
})
