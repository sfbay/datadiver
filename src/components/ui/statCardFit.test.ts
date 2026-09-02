import { describe, it, expect } from 'vitest'
import { fitValueClass } from './statCardFit'

describe('fitValueClass', () => {
  it('keeps the stat size for short values', () => {
    expect(fitValueClass(0)).toBe('text-2xl')
    expect(fitValueClass('Assault'.length)).toBe('text-2xl')
    expect(fitValueClass(14)).toBe('text-2xl')
  })
  it('steps to lg from 15 to 22 characters', () => {
    expect(fitValueClass(15)).toBe('text-lg')
    expect(fitValueClass('Larceny Theft'.length + 4)).toBe('text-lg')
    expect(fitValueClass(22)).toBe('text-lg')
  })
  it('steps to base beyond 22', () => {
    expect(fitValueClass(23)).toBe('text-base')
    expect(fitValueClass('Offences Against The Family And Children'.length)).toBe('text-base')
  })
})
