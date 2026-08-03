import { describe, it, expect } from 'vitest'
import {
  windowDays, clampWindow, resizeToDays, stepWindow, moveToNow,
  type Domain,
} from './dateWindow'

const D: Domain = { start: '2003-01-01', end: '2026-08-03' }

describe('windowDays', () => {
  // EXCLUSIVE, matching the existing daysBetween in DateRangePicker.tsx:29 —
  // Jun 1 to Jun 30 renders as "29d" today and must keep doing so.
  it('is exclusive (end minus start)', () => {
    expect(windowDays({ start: '2026-06-01', end: '2026-06-30' })).toBe(29)
  })
})

describe('resizeToDays', () => {
  it('anchors to the END, leaving it fixed', () => {
    expect(resizeToDays({ start: '2010-01-01', end: '2010-12-31' }, 30, D))
      .toEqual({ start: '2010-12-01', end: '2010-12-31' })
  })
  // THE COMPATIBILITY GUARANTEE: when the range already ends today, a duration
  // reproduces exactly what the preset pills do now.
  it('reproduces today-anchored preset behavior', () => {
    const today = '2026-08-03'
    expect(resizeToDays({ start: '2020-01-01', end: today }, 30, D))
      .toEqual({ start: '2026-07-04', end: today })
  })
  // Regression: a negative `days` used to push the computed start past the
  // fixed end, emitting start > end. clampWindow now normalizes this.
  it('never returns an inverted window given negative days', () => {
    const out = resizeToDays({ start: '2010-01-01', end: '2010-06-15' }, -30, D)
    expect(out.start <= out.end).toBe(true)
  })
})

describe('stepWindow', () => {
  it('shifts by the window own length', () => {
    expect(stepWindow({ start: '2010-06-01', end: '2010-07-01' }, -1, D))
      .toEqual({ start: '2010-05-02', end: '2010-06-01' })
    expect(stepWindow({ start: '2010-06-01', end: '2010-07-01' }, 1, D))
      .toEqual({ start: '2010-07-01', end: '2010-07-31' })
  })
})

describe('clampWindow', () => {
  it('SLIDES back inside the domain, preserving length', () => {
    const out = clampWindow({ start: '2002-01-01', end: '2002-01-31' }, D)
    expect(out.start).toBe('2003-01-01')
    expect(windowDays(out)).toBe(30)
  })
  it('slides at the far end too', () => {
    const out = clampWindow({ start: '2026-08-01', end: '2026-09-30' }, D)
    expect(out.end).toBe('2026-08-03')
    expect(windowDays(out)).toBe(60)
  })
  it('a window longer than the domain becomes the whole domain', () => {
    expect(clampWindow({ start: '1990-01-01', end: '2030-01-01' }, D)).toEqual(D)
  })
  // Regression: an inverted window that already sits fully inside the domain
  // used to pass through unchanged — start after end. clampWindow must
  // normalize via the floored length, never emit start > end.
  it('never returns an inverted window, even given inverted input', () => {
    const out = clampWindow({ start: '2020-07-15', end: '2020-06-15' }, D)
    // 'YYYY-MM-DD' strings sort lexicographically the same as chronologically.
    expect(out.start <= out.end).toBe(true)
  })
})

describe('moveToNow', () => {
  it('keeps the duration and moves the end to today', () => {
    expect(moveToNow({ start: '2010-06-01', end: '2010-06-30' }, '2026-08-03', D))
      .toEqual({ start: '2026-07-05', end: '2026-08-03' })
  })
})
