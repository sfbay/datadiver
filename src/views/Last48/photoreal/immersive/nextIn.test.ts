// src/views/Last48/photoreal/immersive/nextIn.test.ts
import { describe, it, expect } from 'vitest'
import { formatNextIn } from './nextIn'

describe('formatNextIn', () => {
  it('rounds UP to the next whole second', () => {
    expect(formatNextIn(47_100)).toBe('next in 48 s')
    expect(formatNextIn(48_000)).toBe('next in 48 s')
  })
  it('never shows a negative or fractional figure', () => {
    expect(formatNextIn(0)).toBe('next in 0 s')
    expect(formatNextIn(-500)).toBe('next in 0 s')
  })
  it('reads "—" while the clock is not running (flight, settle gate)', () => {
    expect(formatNextIn(null)).toBe('next in —')
  })
})
