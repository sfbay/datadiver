import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CANDIDATE_PALETTE,
  buildCandidateColorMap,
  marginColor,
  turnoutColor,
  measureColor,
} from './electionColors'

/**
 * Every hex value declared in tokens.css. Read from the file rather than
 * duplicated here — a hand-copied list is exactly the drift this guards.
 */
function declaredPigments(): Set<string> {
  const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8')
  return new Set(
    [...css.matchAll(/^\s*--[\w-]+:\s*(#[0-9a-fA-F]{6})\s*;/gm)].map((m) =>
      m[1].toLowerCase(),
    ),
  )
}

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c)

describe('CANDIDATE_PALETTE', () => {
  it('has no duplicate colors', () => {
    // Two candidates in one race painted the same color is indistinguishable
    // from a rendering bug. The old palette repeated #8b6282 and #5c9693.
    const dupes = CANDIDATE_PALETTE.filter(
      (c, i) => CANDIDATE_PALETTE.indexOf(c) !== i,
    )
    expect(dupes).toEqual([])
  })

  it('draws every color from the earth-tone pigments in tokens.css', () => {
    const pigments = declaredPigments()
    const strays = CANDIDATE_PALETTE.filter((c) => !pigments.has(c.toLowerCase()))
    expect(strays).toEqual([])
  })

  it('never places two colors from the same hue family adjacent', () => {
    // Candidates render in rank order, so array neighbours become visual
    // neighbours. Same-family neighbours read as one candidate.
    const pigments = declaredPigments()
    expect(pigments.size).toBeGreaterThan(0)
    const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8')
    const familyOf = (hex: string) => {
      const m = css.match(
        new RegExp(`^\\s*--([a-z]+)-\\d+:\\s*${hex}\\s*;`, 'im'),
      )
      return m?.[1] ?? hex
    }
    for (let i = 1; i < CANDIDATE_PALETTE.length; i++) {
      expect(familyOf(CANDIDATE_PALETTE[i])).not.toBe(
        familyOf(CANDIDATE_PALETTE[i - 1]),
      )
    }
  })
})

describe('buildCandidateColorMap', () => {
  it('gives every candidate in a race a distinct color', () => {
    const candidates = Array.from({ length: CANDIDATE_PALETTE.length }, (_, i) => ({
      name: `CANDIDATE ${i}`,
    }))
    const map = buildCandidateColorMap(candidates)
    expect(new Set(map.values()).size).toBe(candidates.length)
  })

  it('assigns by vote rank: leader gets the palette head regardless of array order', () => {
    // The palette's adjacent-family ordering only protects the big bars if
    // rank 1 actually receives entry 0 — the old name-hash scheme threw
    // that away (2024 mayor: Lurie plum-500, Breed plum-600).
    const a = [
      { name: 'LURIE', totalVotes: 182364 },
      { name: 'PESKIN', totalVotes: 96354 },
      { name: 'BREED', totalVotes: 149113 },
    ]
    const map = buildCandidateColorMap(a)
    expect(map.get('LURIE')).toBe(CANDIDATE_PALETTE[0]) // indigo-500
    expect(map.get('BREED')).toBe(CANDIDATE_PALETTE[1]) // terracotta-600
    expect(map.get('PESKIN')).toBe(CANDIDATE_PALETTE[2]) // moss-500
  })

  it('is independent of input array order (rank comes from totalVotes)', () => {
    const a = [
      { name: 'LURIE', totalVotes: 182364 },
      { name: 'BREED', totalVotes: 149113 },
      { name: 'PESKIN', totalVotes: 96354 },
    ]
    const b = [a[2], a[0], a[1]]
    const ma = buildCandidateColorMap(a)
    const mb = buildCandidateColorMap(b)
    for (const { name } of a) expect(ma.get(name)).toBe(mb.get(name))
  })
})

describe('scales', () => {
  it('emit valid hex across their whole clamped domain', () => {
    for (const t of [-1, 0, 0.25, 0.5, 0.9, 2]) {
      expect(isHex(rgbToHex(marginColor(t)))).toBe(true)
      expect(isHex(rgbToHex(turnoutColor(t)))).toBe(true)
      expect(isHex(rgbToHex(measureColor(t)))).toBe(true)
    }
  })

  it('margin reads pale at a dead heat and deep at a landslide', () => {
    expect(rgbToHex(marginColor(0)).toLowerCase()).toBe('#8a92b5') // indigo-400
    expect(rgbToHex(marginColor(0.5)).toLowerCase()).toBe('#474e74') // indigo-600
  })

  it('measure midpoint is warm paper, not white', () => {
    // #f5f5f5 vanished against the cream light-mode surface.
    expect(rgbToHex(measureColor(0.5)).toLowerCase()).toBe('#d9c9a7') // paper-300
  })
})

/** d3 scales return `rgb(r, g, b)`; normalise so we can compare to tokens. */
function rgbToHex(c: string): string {
  if (c.startsWith('#')) return c
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return c
  return (
    '#' +
    [1, 2, 3]
      .map((i) => Number(m[i]).toString(16).padStart(2, '0'))
      .join('')
  )
}
