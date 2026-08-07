import { describe, it, expect } from 'vitest'
import { OAKLAND_BEATS } from './beats'
import { OAKLAND_BEAT_NAMES } from './beatNames'

describe('OAKLAND_BEAT_NAMES', () => {
  it('key set === OAKLAND_BEATS exactly (bijective, no drift)', () => {
    expect(Object.keys(OAKLAND_BEAT_NAMES).sort()).toEqual([...OAKLAND_BEATS].sort())
  })

  it('no empty or whitespace-padded labels', () => {
    for (const [code, label] of Object.entries(OAKLAND_BEAT_NAMES)) {
      expect(label.trim(), code).toBe(label)
      expect(label.length, code).toBeGreaterThan(0)
    }
  })

  it('spot-pins from the spec table (incl. every verify-pass correction)', () => {
    expect(OAKLAND_BEAT_NAMES['12Y']).toBe('Rockridge & Shafter')
    expect(OAKLAND_BEAT_NAMES['20X']).toBe('North Kennedy Tract & Hawthorne')
    expect(OAKLAND_BEAT_NAMES['26X']).toBe('Melrose')
    expect(OAKLAND_BEAT_NAMES['31X']).toBe('Airport & Coliseum Complex')
    expect(OAKLAND_BEAT_NAMES['LKM1']).toBe('Lake Merritt')
    expect(OAKLAND_BEAT_NAMES['PDT2']).toBe('Piedmont')
  })

  it('labels carry at most two names (the & cap)', () => {
    for (const [code, label] of Object.entries(OAKLAND_BEAT_NAMES)) {
      expect(label.split(' & ').length, code).toBeLessThanOrEqual(2)
    }
  })
})
