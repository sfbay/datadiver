// src/views/Last48/photoreal/groundHeight.test.ts
import { describe, it, expect } from 'vitest'
import { plausibleGround } from './groundHeight'

describe('plausibleGround (one door for tile surface readings)', () => {
  it('passes the city: the Bay, the hills, a tower top', () => {
    expect(plausibleGround(-35)).toBe(-35)
    expect(plausibleGround(250)).toBe(250)
    expect(plausibleGround(520)).toBe(520)
  })
  it('rejects the measured unloaded-tile reading and other nonsense', () => {
    expect(plausibleGround(-25289)).toBeUndefined() // 2026-09-23, start of a flight
    expect(plausibleGround(5000)).toBeUndefined()
    expect(plausibleGround(Number.NaN)).toBeUndefined()
    expect(plausibleGround(undefined)).toBeUndefined()
    expect(plausibleGround(null)).toBeUndefined()
  })
})
