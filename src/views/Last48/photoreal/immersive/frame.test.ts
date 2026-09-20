import { describe, it, expect } from 'vitest'
import { frame169 } from './frame'

describe('frame169', () => {
  it('a wide box is letterboxed left/right', () => {
    expect(frame169(2000, 900)).toEqual({ x: 200, y: 0, w: 1600, h: 900 })
  })
  it('a tall box is letterboxed top/bottom', () => {
    expect(frame169(1600, 1200)).toEqual({ x: 0, y: 150, w: 1600, h: 900 })
  })
  it('an exact 16:9 box fills itself', () => {
    expect(frame169(1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
  })
  it('degenerate boxes give an empty frame', () => {
    expect(frame169(0, 100)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
