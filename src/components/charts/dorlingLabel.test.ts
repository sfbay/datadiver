import { describe, expect, it } from 'vitest'
import { dorlingLabel } from './dorlingLabel'

describe('dorlingLabel', () => {
  it('factor 1 reproduces the legacy inline formulas exactly', () => {
    const s = dorlingLabel(20, 1)
    expect(s.showName).toBe(true)                                   // 20 > 18
    expect(s.showPop).toBe(false)                                   // 20 < 25
    expect(s.nameFontRem).toBe(`${Math.min(11, 20 * 0.42) / 16}rem`)
    expect(s.popFontRem).toBe(`${Math.min(9, 20 * 0.3) / 16}rem`)
    expect(s.nameMaxChars).toBe(Math.floor(20 * 0.38))              // 7
  })

  it('gates rise with the factor so labels that no longer fit are dropped', () => {
    expect(dorlingLabel(20, 1).showName).toBe(true)     // 20 > 18
    expect(dorlingLabel(20, 1.33).showName).toBe(false) // 20 < 18*1.33 = 23.94
    expect(dorlingLabel(30, 1).showPop).toBe(true)      // 30 > 25
    expect(dorlingLabel(30, 1.33).showPop).toBe(false)  // 30 < 25*1.33 = 33.25
  })

  it('char budget shrinks as glyphs grow; the rem value itself is factor-independent', () => {
    expect(dorlingLabel(40, 1.33).nameMaxChars).toBeLessThan(dorlingLabel(40, 1).nameMaxChars)
    expect(dorlingLabel(40, 1.33).nameFontRem).toBe(dorlingLabel(40, 1).nameFontRem)
  })
})
