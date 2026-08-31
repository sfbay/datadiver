// The corrections log is APPEND-ONLY. These pins exist so that removing an
// entry — the quiet version of never publishing it — fails the build.
import { describe, it, expect } from 'vitest'
import { CORRECTIONS } from './corrections'

/** Every id ever published. Add to this list; never take one away. */
const PUBLISHED_IDS = [
  '2026-08-31-sf-crime-counts',
  '2026-08-11-oakland-homicide',
  '2026-07-15-rcv-winners',
]

describe('the corrections log', () => {
  it('still carries every correction ever published', () => {
    for (const id of PUBLISHED_IDS) {
      expect(CORRECTIONS.map((c) => c.id)).toContain(id)
    }
  })

  it('has unique, anchor-safe ids', () => {
    const ids = CORRECTIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('reads newest first', () => {
    const dates = CORRECTIONS.map((c) => c.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('dates are real and the id agrees with the date', () => {
    for (const c of CORRECTIONS) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(c.date))).toBe(false)
      expect(c.id.startsWith(c.date)).toBe(true)
    }
  })

  it('every entry names its surfaces and how long it was live', () => {
    for (const c of CORRECTIONS) {
      expect(c.views.trim().length).toBeGreaterThan(0)
      expect(c.window).toMatch(/live/)
    }
  })

  it('states what a reader who quoted the old figure needs — with a number', () => {
    // A `before` with no figure in it is an admission, not a correction.
    for (const c of CORRECTIONS) {
      expect(c.before).toMatch(/\d/)
      expect(c.before.length).toBeGreaterThan(80)
    }
  })

  it('writes the change in the present tense, not as a hedge', () => {
    for (const c of CORRECTIONS) {
      expect(c.change).toMatch(/\bnow\b/)
      expect(c.change).not.toMatch(/refin|enhanc|improv/i)
    }
  })
})
