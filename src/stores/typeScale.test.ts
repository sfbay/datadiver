import { describe, it, expect } from 'vitest'
import { parseTypeScale } from './typeScale'

describe('parseTypeScale', () => {
  it('returns "large" only for the exact stored value "large"', () => {
    expect(parseTypeScale('large')).toBe('large')
  })

  it('returns "xl" for the exact stored value "xl"', () => {
    expect(parseTypeScale('xl')).toBe('xl')
  })

  it('defaults to "default" for null (unset localStorage key)', () => {
    expect(parseTypeScale(null)).toBe('default')
  })

  it('defaults to "default" for the literal string "default"', () => {
    expect(parseTypeScale('default')).toBe('default')
  })

  it('defaults to "default" for any unrecognized/stale value', () => {
    expect(parseTypeScale('largest')).toBe('default')
    expect(parseTypeScale('')).toBe('default')
    expect(parseTypeScale('true')).toBe('default')
    expect(parseTypeScale(null)).toBe('default')
  })
})
