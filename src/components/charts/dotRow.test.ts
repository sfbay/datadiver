import { describe, it, expect } from 'vitest'
import { dotRowSpec } from './dotRow'

describe('dotRowSpec', () => {
  it('fills the first M of N and leaves the rest hollow', () => {
    const s = dotRowSpec(5, 3)
    expect(s.dots).toEqual(['filled', 'filled', 'filled', 'hollow', 'hollow'])
    expect(s.overflow).toBe(0)
  })
  it('marks accent indices on top of the fill', () => {
    expect(dotRowSpec(4, 4, [1, 3]).dots).toEqual(['filled', 'accent', 'filled', 'accent'])
    expect(dotRowSpec(2, 2, [7]).dots).toEqual(['filled', 'filled']) // out of range ignored
  })
  it('caps the row and reports the overflow', () => {
    const s = dotRowSpec(55, 55, [], 40)
    expect(s.dots).toHaveLength(40)
    expect(s.overflow).toBe(15)
  })
  it('never fills more than it shows', () => {
    expect(dotRowSpec(3, 9).dots).toEqual(['filled', 'filled', 'filled'])
    expect(dotRowSpec(0, 0).dots).toEqual([])
  })
})
