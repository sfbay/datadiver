import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { StorefrontSnapshot } from '@/lib/storefronts/types'
import { FEED_BREAK } from './inspectionFeed'
import { AXIS_START, ERA_SPANS, NOT_PUBLISHED, axisPct, stripBars, stripSummary } from './PublishingStrip'

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../public/data/restaurants/storefronts.json', import.meta.url)), 'utf8'),
) as StorefrontSnapshot
const END = '2026-09-23'

describe('axisPct', () => {
  it('spans AXIS_START → axis end, clamped', () => {
    expect(axisPct(AXIS_START, END)).toBe(0)
    expect(axisPct(END, END)).toBe(100)
    expect(axisPct('2031-05-16', END)).toBe(100) // the junk future row can never widen the axis
    expect(axisPct('2010-01-01', END)).toBe(0)
  })

  it('the feed-break tick falls inside the live era', () => {
    const p = axisPct(FEED_BREAK, END)
    expect(p).toBeGreaterThan(axisPct(ERA_SPANS[2024].start, END))
    expect(p).toBeLessThan(100)
  })
})

describe('stripBars', () => {
  const bars = stripBars(snapshot.publishing, END)

  it('one bar per published year, each inside its era span and never in a gap', () => {
    expect(bars.length).toBe(snapshot.publishing.length)
    for (const b of bars) {
      const s = ERA_SPANS[b.era]
      expect(b.left).toBeGreaterThanOrEqual(axisPct(s.start, END) - 1e-9)
      expect(b.left + b.width).toBeLessThanOrEqual(axisPct(s.end ?? END, END) + 1e-9)
      for (const g of NOT_PUBLISHED) {
        const gl = axisPct(g.start, END)
        const gr = axisPct(g.end, END)
        expect(b.left + b.width <= gl + 1e-9 || b.left >= gr - 1e-9, `${b.year} overlaps a gap`).toBe(true)
      }
    }
  })

  it('heights are scaled within each era only (each era tops out at 1)', () => {
    for (const era of [2016, 2020, 2024] as const) {
      const mine = bars.filter((b) => b.era === era)
      expect(Math.max(...mine.map((b) => b.height))).toBe(1)
    }
  })

  it('names the published months of a partial year', () => {
    const by = (y: number) => bars.find((b) => b.year === y)!
    expect(by(2016).partial).toBe('Oct.–Dec.')
    expect(by(2019).partial).toBe('Jan.–Oct.')
    expect(by(2020).partial).toBe('March–Dec.')
    expect(by(2023).partial).toBe('Jan.–Aug.')
    expect(by(2024).partial).toBeNull()
    expect(by(2026).partial).toBe('Jan.–Sept.')
  })

  it('the summary carries every figure in its own unit', () => {
    const text = stripSummary(bars)
    expect(text).toContain('2017: 7,817 inspections')
    expect(text).toContain('2024: 11,059 records')
  })
})
