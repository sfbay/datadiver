// src/views/Trees/dataNotes.test.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TreesAggregates } from '@/lib/trees/types'
import { buildDataNotes } from './dataNotes'

const A = JSON.parse(readFileSync(join(process.cwd(), 'public/data/trees/aggregates.json'), 'utf8')) as TreesAggregates

describe('data notes — one table, grouped by surface', () => {
  const sections = buildDataNotes(A, 2026)
  it('has the five sections in order', () => {
    expect(sections.map((s) => s.id)).toEqual(['general', 'explore', 'equity', 'safety', 'tree'])
  })
  it('every required caveat is present, once', () => {
    const titles = sections.flatMap((s) => s.notes.map((n) => n.title))
    expect(new Set(titles).size).toBe(titles.length)
    for (const t of [
      'Street trees only', 'Stumps and empty sites', 'Sites without a map point', 'Species names',
      'Two ways to count', 'Flagged neighborhoods', 'Trunk size', 'Fall reports', 'Storm years',
      'Removal notices', 'One site, more than one tree', 'Former trees',
    ]) expect(titles, t).toContain(t)
  })
  it('renders without the snapshot', () => {
    expect(buildDataNotes(null, 2026).length).toBe(5)
  })
  it('figures come from the file, never typed by hand', () => {
    const text = JSON.stringify(sections)
    expect(text).toContain(A.totals.stumps.toLocaleString('en-US'))
    expect(text).toContain(A.totals.unmapped.toLocaleString('en-US'))
    expect(text).toContain(A.notices.replantedAfter.toLocaleString('en-US'))
  })
})

// Ruling R1: years whose reports cannot be placed are shown citywide only, and
// the "within 30 meters" counts are a minimum because of them.
describe('fall reports — the unplaceable years are named, from the file', () => {
  const sections = buildDataNotes(A, 2026)
  const note = (title: string) => sections.flatMap((s) => s.notes).find((n) => n.title === title)!
  const unplaceable = A.falls.years.filter((y) => !y.placeable)
  const placeable = A.falls.years.filter((y) => y.placeable)

  it('the snapshot has at least one unplaceable year (else this block proves nothing)', () => {
    expect(unplaceable.length).toBeGreaterThan(0)
  })
  it('names each unplaceable year with its own placed share', () => {
    const body = note('Fall reports').body
    for (const y of unplaceable) {
      expect(body).toContain(String(y.year))
      expect(body).toContain(`${y.placedShare}%`)
    }
    expect(body).toContain('citywide only')
  })
  it('says the nearby counts are a minimum', () => {
    expect(note('Fall reports').body).toMatch(/within 30 meters.*minimum/)
  })
  it('never prints a placeable year’s share as if it were a gap', () => {
    const body = note('Fall reports').body
    for (const y of placeable) if (y.placedShare !== 100) expect(body).not.toContain(`${y.placedShare}%`)
  })
  it('duplicates and unplaced totals are summed from the years', () => {
    const body = note('Fall reports').body
    const dup = A.falls.years.reduce((s, y) => s + y.duplicates, 0)
    const unp = A.falls.years.reduce((s, y) => s + y.unplaced, 0)
    expect(body).toContain(dup.toLocaleString('en-US'))
    expect(body).toContain(unp.toLocaleString('en-US'))
  })
  it('storm years: the busiest day is stated citywide and nothing by neighborhood', () => {
    const body = note('Storm years').body
    expect(body).toContain(A.falls.busiestDay.reports.toLocaleString('en-US'))
    const dayYear = Number(A.falls.busiestDay.ymd.slice(0, 4))
    const row = A.falls.years.find((y) => y.year === dayYear)!
    if (!row.placeable) expect(body).toContain('citywide')
    for (const n of A.neighborhoods) expect(body).not.toContain(n.name)
  })
  it('the no-snapshot fall note makes no figure claim', () => {
    const body = buildDataNotes(null, 2026).flatMap((s) => s.notes).find((n) => n.title === 'Fall reports')!.body
    expect(body).not.toContain('%')
    expect(body).not.toMatch(/\d,\d{3}/)
  })
})

describe('reader words', () => {
  const BANNED = /σ|sigma|z-?score|ρ|\brho\b|spearman|correlat|baseline|\blive\b|\bage\b|\bremoved\b|this tree fell/i
  it('no note, with or without the snapshot, carries a banned word', () => {
    for (const s of [...buildDataNotes(A, 2026), ...buildDataNotes(null, 2026)]) {
      for (const n of s.notes) if (BANNED.test(n.title) || BANNED.test(n.body)) throw new Error(`${n.title}: ${n.body}`)
      if (BANNED.test(s.title)) throw new Error(s.title)
    }
  })
})
