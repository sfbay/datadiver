// src/views/Trees/dataNotes.test.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARK_HEAVY } from '@/lib/trees/equity'
import { noticedSitesByKind } from '@/lib/trees/siteNotices'
import type { FallYear, TreesAggregates, TreesSnapshot } from '@/lib/trees/types'
import { NOTES_SOURCES, buildDataNotes } from './dataNotes'
import { buildSourceRows } from '@/views/About/sourceRows'

const A = JSON.parse(readFileSync(join(process.cwd(), 'public/data/trees/aggregates.json'), 'utf8')) as TreesAggregates
const T = JSON.parse(readFileSync(join(process.cwd(), 'public/data/trees/trees.json'), 'utf8')) as TreesSnapshot
const K = noticedSitesByKind(T)

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
      'Two ways to count', 'Flagged neighborhoods', 'How the summary sentence is decided', 'Trunk size', 'Fall reports',
      'Storm years', 'Reports and street trees', 'Removal notices', 'One site, more than one tree', 'Former trees',
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
  const BANNED = /σ|sigma|z-?score|ρ|\brho\b|spearman|correlat|baseline|\blive\b|\bage\b|removed|\bfell\b|this tree fell/i
  it('no section title, note title, body or link text, with or without the snapshot, carries a banned word', () => {
    for (const s of [...buildDataNotes(A, 2026, K), ...buildDataNotes(A, 2026), ...buildDataNotes(null, 2026)]) {
      if (BANNED.test(s.title)) throw new Error(s.title)
      for (const n of s.notes) {
        for (const text of [n.title, n.body, n.link?.text ?? '']) if (BANNED.test(text)) throw new Error(`${n.title}: ${text}`)
      }
    }
  })
  it('the popover’s closing line and its link texts carry none either', () => {
    for (const text of [NOTES_SOURCES.lead, ...NOTES_SOURCES.links.map((l) => l.text)]) if (BANNED.test(text)) throw new Error(text)
  })
})

describe('former trees: the records are named, never called complete', () => {
  const b = () => buildDataNotes(A, 2026).flatMap((s) => s.notes).find((n) => n.title === 'Former trees')!.body
  it('names stumps, notices and the log, and the emergency gap; no "only"', () => {
    for (const part of ['Stumps, removal notices', 'log of sites that leave', 'not complete', 'emergency']) expect(b()).toContain(part)
    expect(b()).not.toMatch(/\bonly\b/)
  })
})

// ── Synthetic aggregates: the fall notes' branches the real file may not hit ──
const yr = (year: number, placedShare: number, unplaced: number): FallYear => ({
  year, fallen: 100, aboutToFall: 0, duplicates: 1, unplaced, placedShare, placeable: placedShare >= 75, partial: false,
})
const withFalls = (years: FallYear[], busiestDay = A.falls.busiestDay): TreesAggregates =>
  ({ ...A, falls: { years, busiestDay } })
const body = (a: TreesAggregates, title: string) =>
  buildDataNotes(a, 2026).flatMap((s) => s.notes).find((n) => n.title === title)!.body

describe('fall reports — the minimum sentence follows ANY unplaced report', () => {
  it('unplaced reports but every year placeable: still a minimum', () => {
    const b = body(withFalls([yr(2024, 90, 10), yr(2025, 100, 0)]), 'Fall reports')
    expect(b).toMatch(/within 30 meters is therefore a minimum/)
    expect(b).not.toContain('shown citywide only')
  })
  it('no unplaced report anywhere: no minimum, no "another 0"', () => {
    const b = body(withFalls([yr(2024, 100, 0), yr(2025, 100, 0)]), 'Fall reports')
    expect(b).not.toContain('minimum')
    expect(b).not.toContain('another 0')
    expect(b).toContain('The 2 reports the city closed as duplicates are left out.')
  })
})

describe('citywide-only years read correctly, in ascending order', () => {
  it('one unplaceable year', () => {
    expect(body(withFalls([yr(2024, 90, 10), yr(2022, 46.2, 54)]), 'Fall reports')).toContain(
      'In 2022 only 46.2% of reports carry a usable map point, so that year is shown citywide only.')
  })
  it('two unplaceable years, given out of order', () => {
    expect(body(withFalls([yr(2023, 67.7, 33), yr(2024, 90, 10), yr(2022, 46.2, 54)]), 'Fall reports')).toContain(
      'In 2022 only 46.2% of reports carry a usable map point and in 2023 only 67.7%, so those years are shown citywide only.')
  })
  it('three unplaceable years, given out of order', () => {
    const b = body(withFalls([yr(2023, 67.7, 33), yr(2021, 50, 50), yr(2022, 46.2, 54)]), 'Fall reports')
    expect(b).toContain(
      'In 2021 only 50% of reports carry a usable map point, in 2022 only 46.2% and in 2023 only 67.7%, so those years are shown citywide only.')
    expect(b).toContain('since 2021.')
  })
  it('storm years: one citywide year, no dangling possessive', () => {
    const years = [yr(2022, 90, 10), { ...yr(2023, 60, 40), fallen: 500 }]
    const b = body(withFalls(years, { ymd: '2023-03-21', reports: 80 }), 'Storm years')
    expect(b).toBe('Counting fallen-tree and about-to-fall reports together, 2023 has the most of the years shown, 500, ' +
      'including 80 filed on March 21, 2023. ' +
      'These are citywide figures, since too few of the 2023 reports carry a map point to split by neighborhood. ' +
      'The years are shown side by side and never added into one figure.')
  })
  it('storm years: two citywide years (busiest year ≠ busiest day’s year), ascending', () => {
    const years = [{ ...yr(2023, 60, 40), fallen: 500 }, yr(2022, 50, 50)]
    const b = body(withFalls(years, { ymd: '2022-01-05', reports: 90 }), 'Storm years')
    expect(b).toContain('too few of the 2022 and 2023 reports carry a map point')
    expect(b).toContain('the busiest single day was Jan. 5, 2022, with 90')
    expect(b).not.toMatch(/’s reports/)
  })
})

describe('the reports note and the storm years say what their figures count', () => {
  const note = (title: string) => buildDataNotes(A, 2026).flatMap((s) => s.notes).find((n) => n.title === title)!.body
  it('reports and street trees: no rate, and why (R17)', () => {
    const b = note('Reports and street trees')
    for (const part of ['with a map point in the neighborhood', 'No rate is shown', 'any tree, including park and private trees',
      'street trees in the inventory today, not in that year']) expect(b).toContain(part)
    const titles = buildDataNotes(A, 2026).flatMap((s) => s.notes).map((n) => n.title)
    expect(titles).not.toContain('Reports per 1,000 street trees')
    for (const n of buildDataNotes(A, 2026).flatMap((s) => s.notes)) expect(n.body, n.title).not.toMatch(/per 1,000 street trees/)
  })
  it('storm years: the combined figure is named as both kinds together', () => {
    expect(note('Storm years')).toMatch(/^Counting fallen-tree and about-to-fall reports together, /)
  })
})

describe('note lengths: at most three sentences (Fall reports excepted, ruling R1)', () => {
  const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length
  for (const a of [A, null]) {
    it(`${a ? 'with' : 'without'} the snapshot`, () => {
      for (const n of buildDataNotes(a, 2026).flatMap((s) => s.notes)) {
        if (n.title === 'Fall reports') continue
        expect(sentences(n.body), `${n.title}: ${n.body}`).toBeLessThanOrEqual(3)
      }
    })
  }
})

// Task 13 polish: the equity count is read from the rows, the flagged note
// names every place a flagged neighborhood is left out of, the trunk note
// reads plainly, and the popover's source links land on real About rows.
describe('equity and trunk notes read from the rows, and say what they mean', () => {
  const note = (a: TreesAggregates, title: string) => buildDataNotes(a, 2026).flatMap((s) => s.notes).find((n) => n.title === title)!.body
  it('"neighborhoods without a flag" counts unflagged rows, not equity.n', () => {
    const unflagged = A.neighborhoods.filter((n) => n.flag === null).length
    expect(note(A, 'Two ways to count')).toContain(`across the ${unflagged} neighborhoods without a flag`)
    const skewed = { ...A, equity: { ...A.equity, n: 999 } }
    expect(note(skewed, 'Two ways to count')).toContain(`across the ${unflagged} neighborhoods without a flag`)
  })
  it('flagged neighborhoods: hatched, and left out of ranks, medians, color scale and summary', () => {
    const b = note(A, 'Flagged neighborhoods')
    for (const part of ['hatched on the map', 'rank positions', 'medians', 'color scale', 'summary sentence']) expect(b).toContain(part)
  })
  it('trunk size: the city’s size category is named, and DataDiver reads the trunk width', () => {
    expect(note(A, 'Trunk size')).toContain('the city’s own size category files those as large, so DataDiver reads the trunk width directly')
  })
})

describe('the popover’s source links', () => {
  it('each lands on a row of the About sources table', () => {
    const anchors = new Set(buildSourceRows('sf').map((r) => `/about#${r.anchorId}`))
    expect(NOTES_SOURCES.links.map((l) => l.href)).toEqual([
      '/about#source-sf-tkzw-k3nq', '/about#source-sf-qrwx-q4gg', '/about#source-sf-dd-street-trees',
    ])
    for (const l of NOTES_SOURCES.links) expect(anchors.has(l.href), l.href).toBe(true)
  })
})

// Final review I2: a noticed site still in the inventory may now be a stump or
// an empty site, and the note says what the sites hold now.
describe('removal notices: what the noticed sites are listed as now', () => {
  const note = (k: typeof K | null) => buildDataNotes(A, 2026, k).flatMap((s) => s.notes).find((n) => n.title === 'Removal notices')!.body
  it('with the snapshot: the four figures, computed', () => {
    const b = note(K)
    expect(b).toContain(`${A.notices.listed.toLocaleString('en-US')} are still in the inventory: ` +
      `${K.tree.toLocaleString('en-US')} listed as a street tree, ${K.stump} as a stump, ${K.site} as an empty planting site and ${K.shrub} as a shrub.`)
    expect(b).not.toMatch(/taken out/)
  })
  it('before the snapshot loads: the bare figure never stands alone', () => {
    expect(note(null)).toContain('some of them now as a stump or an empty planting site')
  })
  it('the former-trees note: a site may stay, re-classed', () => {
    const b = buildDataNotes(A, 2026).flatMap((s) => s.notes).find((n) => n.title === 'Former trees')!.body
    expect(b).toContain('may drop its row or keep the site as a stump or an empty planting site')
    expect(b).not.toMatch(/leaves the inventory|taken out/)
  })
})

// Ruling R18: the lead's rule and the neighborhoods whose removal changes a
// reading — read from the file. Ruling R20: the park-heavy flag is listed
// with its measured shares, read from PARK_HEAVY.
describe('how the summary sentence is decided', () => {
  const note = (a: TreesAggregates | null) =>
    buildDataNotes(a, 2026).flatMap((s) => s.notes).find((n) => n.title === 'How the summary sentence is decided')!.body
  it('names the rule and every neighborhood whose removal alone changes the per-area reading', () => {
    expect(note(A)).toBe(
      'A pattern is stated only if it still shows when any one neighborhood is left out. ' +
      'Counted per square kilometer, the pattern no longer shows once any one of Bayview Hunters Point, Chinatown, Excelsior, ' +
      'Seacliff or Visitacion Valley is left out, so the sentence states none for that measure.',
    )
  })
  it('without the file: the rule only, no figure', () => {
    expect(note(null)).toBe('A pattern is stated only if it still shows when any one neighborhood is left out.')
  })
  it('when no single removal changes a reading, it says so', () => {
    const flat = { ...A, neighborhoods: A.neighborhoods.map((n) => (n.flag === null ? { ...n, perK: n.medianIncome!, perKm2: n.medianIncome! } : n)) }
    expect(note(flat)).toBe(
      'A pattern is stated only if it still shows when any one neighborhood is left out. Leaving out any one neighborhood changes neither reading.')
  })
})

describe('flagged neighborhoods: the park-heavy reason, with its shares and source (R20)', () => {
  const body = () => buildDataNotes(A, 2026).flatMap((s) => s.notes).find((n) => n.title === 'Flagged neighborhoods')!.body
  it('lists both names with their measured open-space shares, read from PARK_HEAVY', () => {
    for (const [name, share] of Object.entries(PARK_HEAVY)) expect(body()).toContain(`${name} ${share}%`)
    expect(body()).toContain('Planning Department’s land-use file, Sept. 30, 2026')
  })
  it('never claims few streets or few trees about a flagged neighborhood (N1)', () => {
    expect(body()).not.toMatch(/\bfew\b[^.]*\b(streets?|trees)\b/i)
    expect(body()).not.toMatch(/dominate/)
    expect(body()).toContain('trees there are not in this inventory')
    expect(body()).toContain('residential streets count in the citywide figures')
  })
})
