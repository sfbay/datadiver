import { describe, it, expect } from 'vitest'
import { dayIndex, layoutSpans, durationWidth, yearTicks } from './spanLayout'

describe('dayIndex', () => {
  it('indexes calendar days without reading the host time zone', () => {
    expect(dayIndex('1970-01-01')).toBe(0)
    expect(dayIndex('1970-01-02')).toBe(1)
    expect(dayIndex('2024-07-15') - dayIndex('2024-07-01')).toBe(14)
    expect(dayIndex('2024-07-15T00:00:00.000')).toBe(dayIndex('2024-07-15')) // DataSF datetime shape
    expect(Number.isNaN(dayIndex('junk'))).toBe(true)
  })
})

describe('layoutSpans', () => {
  const axis = ['2020-01-01', '2020-12-31'] as const
  it('places a closed span by its dates', () => {
    const [b] = layoutSpans([{ start: '2020-07-01', end: '2020-07-31' }], axis, 365)
    expect(Math.round(b.x)).toBe(182)
    expect(Math.round(b.width)).toBe(30)
    expect(b.open).toBe(false)
  })
  it('runs an open span to the axis end and flags it', () => {
    const [b] = layoutSpans([{ start: '2020-12-01', end: null }], axis, 365)
    expect(b.open).toBe(true)
    expect(Math.round(b.x + b.width)).toBe(365)
  })
  it('a same-day span keeps a visible minimum width', () => {
    const [b] = layoutSpans([{ start: '2020-03-05', end: '2020-03-05' }], axis, 365)
    expect(b.width).toBe(2)
  })
  it('clamps to the axis and drops visit ticks outside the span', () => {
    const [b] = layoutSpans([{ start: '2019-06-01', end: '2020-02-01', visits: ['2019-12-01', '2020-01-15', '2020-03-01'] }], axis, 365)
    expect(b.x).toBe(0)
    expect(b.tickXs).toHaveLength(1)
  })
})

describe('durationWidth', () => {
  it('scales days on 0…cap, pins past the cap, and fills for an open run', () => {
    expect(durationWidth(15, 30, 100)).toEqual({ width: 50, capped: false })
    expect(durationWidth(380, 30, 100)).toEqual({ width: 100, capped: true })
    expect(durationWidth(0, 30, 100).width).toBe(2) // same day still visible
    expect(durationWidth(null, 30, 100)).toEqual({ width: 100, capped: false })
  })
})

describe('yearTicks', () => {
  it('emits one tick per new year strictly inside the axis', () => {
    const t = yearTicks(['2020-03-01', '2023-06-30'], 300)
    expect(t.map((x) => x.year)).toEqual([2021, 2022, 2023])
    expect(t[0].x).toBeGreaterThan(0)
    expect(t[2].x).toBeLessThan(300)
  })
})
