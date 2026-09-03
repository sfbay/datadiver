import { describe, it, expect } from 'vitest'
import { SEARCH_SAMPLES } from './searchSamples'
import { buildFullIndex } from './useOmniSearch'

// The Home search box's sample pills are promises: "type this, land there".
// This test keeps every promise true against the REAL composed index — the
// same buildFullIndex the hook filters, the hook's exact predicate (a whole-
// string substring test over label||sublabel, lowercased), the same
// `view-home` omission Home passes (`omitViewId: 'home'`). The first row is
// what Enter lands on, so the first row is what gets pinned.
//
// This is the defense against the PR #9 failure: the old ribbon's placeholder
// advertised six queries that returned zero rows. A pill that stops resolving
// now fails the build instead of lying on the page.
describe('SEARCH_SAMPLES (Home search pills — every pill resolves)', () => {
  const index = buildFullIndex('sf', 'home').filter((r) => r.id !== 'view-home')
  const matches = (query: string) => {
    const q = query.trim().toLowerCase()
    return index.filter(
      (r) => r.label.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
    )
  }

  for (const sample of SEARCH_SAMPLES) {
    it(`'${sample.query}' lands on ${sample.expect.path}${sample.expect.params ? ' with its params' : ''}`, () => {
      const rows = matches(sample.query)
      expect(rows.length, `'${sample.query}' returned no rows`).toBeGreaterThan(0)
      const first = rows[0]
      expect(first.path).toBe(sample.expect.path)
      if (sample.expect.params) expect(first.params).toEqual(sample.expect.params)
    })
  }

  it('labels are unique and short enough for a pill (≤ 22 chars)', () => {
    const labels = SEARCH_SAMPLES.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label.length, label).toBeLessThanOrEqual(22)
  })

  it('no pill has an empty query', () => {
    for (const s of SEARCH_SAMPLES) expect(s.query.trim().length, s.label).toBeGreaterThan(0)
  })
})
