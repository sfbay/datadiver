// src/views/Trees/trunkScale.test.ts
import { describe, expect, it } from 'vitest'
import { TRUNK_CLASSES } from '@/lib/trees/trunk'
import { CARD_SCALE, TOOLTIP_SCALE, trunkScaleGeometry, trunkScaleHtml, trunkScaleSpec } from './trunkScale'
import { esc, stumpHoverHtml, treeHoverHtml } from './hoverCard'

const active = (s: ReturnType<typeof trunkScaleSpec>) => s.steps.filter((x) => x.active).map((x) => x.key)

describe('trunkScaleSpec', () => {
  it('three steps in order, with their labels', () => {
    expect(trunkScaleSpec('small', 3).steps.map((s) => [s.key, s.label])).toEqual([
      ['small', '10 inches or narrower'], ['medium', '11 to 20 inches'], ['large', '21 inches or wider'],
    ])
  })
  it('exactly one step is active for every measured class', () => {
    for (const cls of TRUNK_CLASSES) {
      if (cls === 'unmeasured') continue
      const s = trunkScaleSpec(cls, null)
      expect(active(s)).toEqual([cls])
      expect(s.measured).toBe(true)
    }
  })
  it('each class places its tick inside its own third', () => {
    expect(trunkScaleSpec('small', 3).tick).toBeCloseTo(0.1)
    expect(trunkScaleSpec('medium', 15.5).tick).toBeCloseTo(0.5)
    expect(trunkScaleSpec('large', 40.5).tick).toBeCloseTo(2 / 3 + 0.5 / 3)
  })
  it('the boundaries: 10 ends the small step, 11 starts the medium; 20 ends medium, 21 starts large', () => {
    expect(trunkScaleSpec('small', 10).tick).toBeCloseTo(1 / 3)
    expect(trunkScaleSpec('medium', 11).tick).toBeCloseTo(1 / 3)
    expect(trunkScaleSpec('medium', 20).tick).toBeCloseTo(2 / 3)
    expect(trunkScaleSpec('large', 21).tick).toBeCloseTo(2 / 3)
    // …and the geometry puts 10 and 11 in different steps, never in the gap.
    const g10 = trunkScaleGeometry(trunkScaleSpec('small', 10), CARD_SCALE)
    const g11 = trunkScaleGeometry(trunkScaleSpec('medium', 11), CARD_SCALE)
    const [s0, s1] = g10.segments
    expect(g10.tick!.x).toBeLessThanOrEqual(s0.x + s0.w)
    expect(g11.tick!.x).toBeGreaterThanOrEqual(s1.x)
  })
  it('clamps at 60 inches: a 126-inch record sits at the right end', () => {
    expect(trunkScaleSpec('large', 60).tick).toBe(1)
    expect(trunkScaleSpec('large', 126).tick).toBe(1)
    const g = trunkScaleGeometry(trunkScaleSpec('large', 126), TOOLTIP_SCALE)
    expect(g.tick!.x).toBeLessThanOrEqual(TOOLTIP_SCALE.width)
  })
  it('class only (the hover card): no tick', () => {
    const s = trunkScaleSpec('medium', null)
    expect(s.tick).toBeNull()
    expect(trunkScaleGeometry(s, TOOLTIP_SCALE).tick).toBeNull()
    expect(s.sentence).toBe('Trunk size as recorded: 11 to 20 inches.')
  })
  it('unmeasured: no active step, not measured, hollow, no tick', () => {
    const s = trunkScaleSpec('unmeasured', null)
    expect(active(s)).toEqual([])
    expect(s.measured).toBe(false)
    expect(s.tick).toBeNull()
    expect(s.sentence).toBe('Trunk size not measured.')
    expect(trunkScaleGeometry(s, CARD_SCALE).hollow).toBe(true)
  })
  it('the sentence carries the inches when known', () => {
    expect(trunkScaleSpec('small', 3).sentence)
      .toBe('Trunk size as recorded: 3 inches, in the smallest of three size groups (10 inches or narrower).')
  })
})

describe('trunkScaleHtml', () => {
  for (const [cls, inches] of [['small', null], ['large', 30], ['unmeasured', null]] as const) {
    it(`${cls}: an img with the sentence, three steps, rem sizes only`, () => {
      const spec = trunkScaleSpec(cls, inches)
      const html = trunkScaleHtml(spec)
      expect(html).toContain('role="img"')
      expect(html).toContain(`aria-label="${spec.sentence}"`)
      expect(html.match(/data-step=/g)).toHaveLength(3)
      expect(html).not.toMatch(/font-size\s*:\s*[\d.]+px/)
      expect(html).toContain('width:4.5rem')
    })
  }
  it('unmeasured steps are dashed outlines', () => {
    expect(trunkScaleHtml(trunkScaleSpec('unmeasured', null)).match(/stroke-dasharray/g)).toHaveLength(3)
  })
})

describe('the hover card', () => {
  it('a tree: headline in the display face, the mark, then label and value once', () => {
    const html = treeHoverHtml('Brisbane Box', 'small')
    expect(html).toContain('Fraunces')
    expect(html).toContain('>Brisbane Box<')
    expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('Brisbane Box'))
    expect(html.indexOf('Trunk size as recorded<')).toBeGreaterThan(html.indexOf('</svg>'))
    expect(html).toContain('>10 inches or narrower<')
    expect(html).not.toMatch(/font-size\s*:\s*[\d.]+px/)
    expect(html).not.toMatch(/uppercase/)
  })
  it('an unmeasured tree reads "Not measured"', () => {
    expect(treeHoverHtml('Species not recorded', 'unmeasured')).toContain('>Not measured<')
  })
  it('escapes every data string', () => {
    const html = treeHoverHtml('<img src=x onerror=alert(1)> "Fig"', 'large')
    expect(html).not.toContain('<img')
    expect(html).toContain(esc('<img src=x onerror=alert(1)> "Fig"'))
  })
  it('a stump: headline and one body line, no scale', () => {
    const html = stumpHoverHtml()
    expect(html).toContain('>Stump<')
    expect(html).toContain('A stump stands here')
    expect(html).not.toContain('<svg')
  })
})
