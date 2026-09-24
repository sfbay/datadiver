import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { StorefrontSnapshot } from '@/lib/storefronts/types'
import { LOOKUP_SAMPLES, buildLookupIndex, lookupMatches, normalizeLookup } from './StorefrontLookup'

// The lookup's sample pills are promises — "type this, land there" — kept
// true against the COMMITTED snapshot (the searchSamples.test.ts pattern):
// the real index, the component's own matcher, the first row pinned.
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../public/data/restaurants/storefronts.json', import.meta.url)), 'utf8'),
) as StorefrontSnapshot
const index = buildLookupIndex(snapshot)
const byKey = new Map(snapshot.storefronts.map((s) => [s.key, s]))
const find = (q: string) => lookupMatches(index, byKey, q)

describe('LOOKUP_SAMPLES (every pill resolves to its first row)', () => {
  for (const s of LOOKUP_SAMPLES) {
    it(`'${s.query}' → ${s.expectKey}`, () => {
      const rows = find(s.query)
      expect(rows.length, `'${s.query}' returned no rows`).toBeGreaterThan(0)
      expect(rows[0].key).toBe(s.expectKey)
    })
  }

  it('labels are unique, short and non-empty', () => {
    const labels = LOOKUP_SAMPLES.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const s of LOOKUP_SAMPLES) {
      expect(s.label.length, s.label).toBeLessThanOrEqual(22)
      expect(s.query.trim().length, s.label).toBeGreaterThan(0)
    }
  })
})

describe('matching', () => {
  it('finds an address typed the long way (storefront-key form)', () => {
    expect(find('2704 24th Street')[0]?.key).toBe('2704 24TH ST')
  })

  it('ranks an address prefix above a longer house number containing it', () => {
    const rows = find('570 Green St')
    expect(rows[0].key).toBe('570 GREEN ST')
    expect(rows[0].kind).toBe('address')
  })

  it('matches every name seen at a door, not only the current one', () => {
    // Almanac left 2704 24th St in 2017; the door still answers to it.
    expect(find('Almanac').map((r) => r.key)).toContain('2704 24TH ST')
  })

  it('one row per storefront, capped', () => {
    const rows = find('st')
    expect(rows.length).toBeLessThanOrEqual(8)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  it('ignores a one-character query', () => {
    expect(find('a')).toEqual([])
  })

  it('normalizes apostrophes, periods and spacing', () => {
    expect(normalizeLookup("  Pete's   On Green, L.L.C. ")).toBe('petes on green llc')
  })
})

describe('no search BY a natural person’s name (§11)', () => {
  it('indexes owner names only for company owners', () => {
    const companyOwners = new Set<string>()
    for (const s of snapshot.storefronts)
      for (const o of s.operators) if (o.owner?.kind === 'company') companyOwners.add(normalizeLookup(o.owner.name))
    const owners = index.filter((e) => e.kind === 'owner')
    expect(owners.length).toBeGreaterThan(0)
    for (const e of owners) expect(companyOwners.has(e.norm), e.text).toBe(true)
  })

  // A company can carry a person's name ('Rashad Sghayer Inc'); that company
  // name IS indexed — the registry publishes it as a company. What must never
  // be indexed is the individual registration itself.
  it('an individual owner’s name finds nothing unless a trade name, address or company carries it', () => {
    const shown = index.map((e) => e.norm)
    const people = new Set<string>()
    for (const s of snapshot.storefronts)
      for (const o of s.operators) if (o.owner?.kind === 'individual') people.add(o.owner.name)
    let checked = 0
    for (const name of people) {
      const q = normalizeLookup(name)
      if (q.length < 2 || shown.some((t) => t.includes(q))) continue
      expect(find(name), name).toEqual([])
      checked++
    }
    // The guard ran over real names, not an empty set.
    expect(checked).toBeGreaterThan(100)
  })
})
