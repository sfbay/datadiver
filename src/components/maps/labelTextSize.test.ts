import { describe, expect, it } from 'vitest'
import { scaleTextSizeValue } from './labelTextSize'

describe('scaleTextSizeValue', () => {
  it('scales a bare number', () => {
    expect(scaleTextSizeValue(12, 1.18)).toBeCloseTo(14.16)
  })

  it('factor 1 is a deep identity', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 11, 18, 16]
    expect(scaleTextSizeValue(expr, 1)).toEqual(expr)
  })

  it('scales interpolate OUTPUTS only, never the zoom stops', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 9, 14, 12]
    expect(scaleTextSizeValue(expr, 1.33)).toEqual([
      'interpolate', ['linear'], ['zoom'], 10, 0, 12, 9 * 1.33, 14, 12 * 1.33,
    ])
  })

  it('scales step outputs at positions 2, 4, 6…', () => {
    const expr = ['step', ['zoom'], 10, 14, 12, 16, 14]
    expect(scaleTextSizeValue(expr, 2)).toEqual(['step', ['zoom'], 20, 14, 24, 16, 28])
  })

  it('returns null for unrecognized shapes so callers skip the layer', () => {
    expect(scaleTextSizeValue(['match', ['get', 'class'], 'a', 10, 12], 1.18)).toBeNull()
    expect(scaleTextSizeValue('16', 1.18)).toBeNull()
    expect(scaleTextSizeValue(['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'x'], 'a', 1, 2]], 1.18)).toBeNull()
  })

  it('does not mutate the input expression', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 11, 18, 16]
    const copy = JSON.parse(JSON.stringify(expr))
    scaleTextSizeValue(expr, 1.33)
    expect(expr).toEqual(copy)
  })
})
