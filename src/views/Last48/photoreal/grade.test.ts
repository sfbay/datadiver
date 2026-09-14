import { describe, it, expect } from 'vitest'
import { GRADES, gradeForTheme, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL } from './grade'

describe('grade', () => {
  it('spike values pinned', () => {
    expect(GRADES.day).toEqual({ tint: [1, 1, 1], mul: 1, win: 0 })
    expect(GRADES.dusk).toEqual({ tint: [1, 0.8, 0.62], mul: 0.82, win: 0.35 })
    expect(GRADES.night).toEqual({ tint: [0.42, 0.5, 0.78], mul: 0.3, win: 1.6 })
  })
  it('theme → day/dusk; ?tod= overrides; junk override ignored', () => {
    expect(gradeForTheme(false, null)).toBe('day')
    expect(gradeForTheme(true, null)).toBe('dusk')
    expect(gradeForTheme(false, 'night')).toBe('night')
    expect(gradeForTheme(true, 'day')).toBe('day')
    expect(gradeForTheme(true, 'noon')).toBe('dusk')
  })
  it('clock instants are SF 13:00 / 19:20 / 22:30 PDT', () => {
    expect(GRADE_CLOCK_ISO).toEqual({ day: '2026-09-09T20:00:00Z', dusk: '2026-09-10T02:20:00Z', night: '2026-09-10T05:30:00Z' })
  })
  it('the shader uses the three uniforms', () => {
    for (const u of ['u_tint', 'u_mul', 'u_win']) expect(GRADE_FRAGMENT_GLSL).toContain(u)
    expect(GRADE_FRAGMENT_GLSL).toContain('fragmentMain')
  })
})
