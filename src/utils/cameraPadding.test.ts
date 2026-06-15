// src/utils/cameraPadding.test.ts
import { describe, it, expect } from 'vitest'
import { rightBandWidth, eventFlyToOffset } from './cameraPadding'

// rightBandWidth(cardWidthPx, mapWidthPx)
//   = min(cardWidthPx + 20 (right-5) + 24 (gutter), floor(mapWidthPx * 0.5))

describe('rightBandWidth', () => {
  it('on a wide map, band = card + anchor + gutter (no clamp)', () => {
    // w-72 card (288) on a 1280px map: 288 + 20 + 24 = 332, well under half (640)
    expect(rightBandWidth(288, 1280)).toBe(332)
  })

  it('a wider card (w-80 = 320) produces a wider band', () => {
    expect(rightBandWidth(320, 1280)).toBe(364)
  })

  it('clamps to half the map width on narrow viewports', () => {
    // 288px card on a 360px phone: raw 332 would exceed half (180) → clamped
    expect(rightBandWidth(288, 360)).toBe(180) // floor(360 * 0.5)
  })

  it('uses floor for the half-map clamp (odd widths)', () => {
    // raw = 332; floor(361 * 0.5) = 180 → clamp wins
    expect(rightBandWidth(288, 361)).toBe(180)
  })

  it('band never exceeds half the map, regardless of card size', () => {
    for (const mapW of [320, 500, 768, 1024, 1440]) {
      for (const cardW of [240, 288, 320, 400]) {
        expect(rightBandWidth(cardW, mapW)).toBeLessThanOrEqual(Math.floor(mapW * 0.5))
      }
    }
  })
})

describe('eventFlyToOffset', () => {
  it('returns [-band/2, 0] (shift target left by half the obstructed band)', () => {
    const fakeMap = { getContainer: () => ({ clientWidth: 1280 }) } as unknown as Parameters<typeof eventFlyToOffset>[0]
    const [dx, dy] = eventFlyToOffset(fakeMap, 288)
    expect(dx).toBe(-332 / 2) // -166
    expect(dy).toBe(0)
  })

  it('offset magnitude grows with a wider card', () => {
    const fakeMap = { getContainer: () => ({ clientWidth: 1280 }) } as unknown as Parameters<typeof eventFlyToOffset>[0]
    const [dxNarrow] = eventFlyToOffset(fakeMap, 288)
    const [dxWide] = eventFlyToOffset(fakeMap, 320)
    expect(Math.abs(dxWide)).toBeGreaterThan(Math.abs(dxNarrow))
  })
})
