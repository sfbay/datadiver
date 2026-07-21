import { describe, it, expect } from 'vitest'
import { mixHex } from './colorMix'

describe('mixHex', () => {
  it('t = 0 returns the first color unchanged', () => {
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('t = 1 returns the second color unchanged', () => {
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('t = 0.5 blends halfway between colors', () => {
    // mixHex('#000000', '#ffffff', 0.5):
    // r: 0 + (255 - 0) * 0.5 = 127.5 → Math.round = 128 → '80'
    // g: 0 + (255 - 0) * 0.5 = 127.5 → Math.round = 128 → '80'
    // b: 0 + (255 - 0) * 0.5 = 127.5 → Math.round = 128 → '80'
    // Result: '#808080'
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('interpolates arbitrary color channels independently', () => {
    // Testing with red (255,0,0) and blue (0,0,255) at t=0.5:
    // r: 255 + (0 - 255) * 0.5 = 127.5 → '80'
    // g: 0 + (0 - 0) * 0.5 = 0 → '00'
    // b: 0 + (255 - 0) * 0.5 = 127.5 → '80'
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080')
  })
})
