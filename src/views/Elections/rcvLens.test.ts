import { describe, it, expect } from 'vitest'
import { ALL_LENSES, SHIPPED_LENSES, parseLens } from './rcvLens'

describe('parseLens', () => {
  it('accepts a shipped lens', () => {
    expect(parseLens('replay')).toBe('replay')
  })

  it('degrades a known-but-unshipped lens to null (deep links degrade gracefully)', () => {
    expect(parseLens('coalition')).toBe(null)
  })

  it('rejects garbage and null', () => {
    expect(parseLens('garbage')).toBe(null)
    expect(parseLens(null)).toBe(null)
  })
})

describe('lens registry', () => {
  it('ALL_LENSES has all three lenses', () => {
    expect(ALL_LENSES).toEqual(['replay', 'coalition', 'whatif'])
  })

  it('SHIPPED_LENSES is a subset of ALL_LENSES', () => {
    for (const lens of SHIPPED_LENSES) {
      expect(ALL_LENSES).toContain(lens)
    }
  })
})
