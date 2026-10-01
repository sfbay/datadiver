// src/views/Trees/tabOpeners.test.ts
//
// Ruling R22 (Jesse, walk, Sept. 30 2026): every rail tab opens with its big
// numbers — the RailStat chip grid is the tab's first element, with no prose
// sentence above it; the equity summary sentence and the parks line live in
// the data notes (dataNotes.test.ts pins them there). And a PartWhole inside
// a chip is fluid and figure-less: a fixed-width bar plus its mono "n of m"
// ran past a half-width chip's right edge. Source scans — the components need
// a DOM this node-only suite does not have.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RAIL_STAT_GRID } from './exploreRows'

const TABS = ['ExploreTab', 'EquityTab', 'SafetyTab'] as const
const src = (name: string) => readFileSync(join(process.cwd(), 'src/views/Trees', `${name}.tsx`), 'utf8')

/** The JSX right after the component's outer wrapper, comments stripped. */
function firstChild(code: string): string {
  const m = code.match(/return \(\s*<div className="flex flex-col gap-\d+">([\s\S]*)/)
  if (!m) throw new Error('no outer wrapper found')
  return m[1].replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trimStart()
}

describe('every tab opens with its chips (R22)', () => {
  for (const tab of TABS) {
    it(`${tab}: the chip grid comes first`, () => {
      expect(firstChild(src(tab))).toMatch(/^<div className=\{RAIL_STAT_GRID\}>/)
    })
  }
  it('the Equity tab no longer prints the summary sentence or the parks line', () => {
    // Comments may name them (the header says where they went); code may not.
    const code = src('EquityTab').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bequityLead\b/)
    expect(code).not.toMatch(/\bPARKS_LINE\b/)
  })
})

describe('a chip never overflows its grid cell', () => {
  it('the opener grid is liquid: as many columns as fit, never a fixed two', () => {
    expect(RAIL_STAT_GRID).toMatch(/grid-cols-\[repeat\(auto-fit,minmax\([\d.]+rem,1fr\)\)\]/)
  })
  for (const tab of TABS) {
    it(`${tab}: wide chips span with col-span-full, never col-span-2 or a hand-picked column count`, () => {
      const code = src(tab)
      expect(code).not.toContain('col-span-2')
      expect(code).not.toMatch(/grid-cols-[12]\b/)
    })
  }
})

describe('a PartWhole inside a chip never overflows it', () => {
  it('the scan sees the Explore tab’s top-five chip (else it proves nothing)', () => {
    expect(src('ExploreTab').match(/mark=\{<PartWhole[^>]*\/>\}/g)?.length).toBe(1)
  })
  for (const tab of TABS) {
    it(`${tab}: every chip mark PartWhole is fluid and figure-less`, () => {
      const marks = src(tab).match(/mark=\{<PartWhole[^>]*\/>\}/g) ?? []
      for (const m of marks) {
        expect(m, m).toMatch(/\sfluid[\s/]/)
        expect(m, m).toContain('figures={false}')
      }
    })
  }
})
