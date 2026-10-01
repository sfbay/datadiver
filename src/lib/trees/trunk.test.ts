// src/lib/trees/trunk.test.ts
import { describe, expect, it } from 'vitest'
import { TRUNK_CLASSES, TRUNK_LABEL, trunkClass } from './trunk'

describe('trunkClass — from mapdbh only, never dbhrange', () => {
  it('uses the city\'s own bands at their edges', () => {
    expect(trunkClass('3')).toBe('small')
    expect(trunkClass(10)).toBe('small')
    expect(trunkClass('11')).toBe('medium')
    expect(trunkClass(20)).toBe('medium')
    expect(trunkClass('21')).toBe('large')
    expect(trunkClass(130)).toBe('large')
  })
  it('missing, blank, zero and junk are UNMEASURED (the city files these as large)', () => {
    for (const v of [null, undefined, '', '0', 0, -4, 'abc', NaN]) expect(trunkClass(v), String(v)).toBe('unmeasured')
  })
  it('class order is the snapshot code order', () => {
    expect(TRUNK_CLASSES).toEqual(['small', 'medium', 'large', 'unmeasured'])
    expect(TRUNK_LABEL.large).toBe('21 inches or wider')
  })
})
