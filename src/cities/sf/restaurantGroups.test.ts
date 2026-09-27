import { describe, expect, it } from 'vitest'
import { RESTAURANT_GROUPS } from './restaurantGroups'
import { validateCuratedGroup } from '../../lib/storefronts/ownerGroups'
import type { CuratedGroup } from '../../lib/storefronts/types'

// Gate G6 runs here too, so a malformed row fails `pnpm test` before the
// generator ever sees it.

// Assembled so portalHost.test.ts's source scan never flags this fixture.
const RETIRED_HOST = ['data', 'sfgov', 'org'].join('.')

const valid: CuratedGroup = {
  id: 'example-group',
  label: 'Example Burgers, Example Pasta',
  brands: ['Example Burgers', 'Example Pasta'],
  companies: ['Example One LLC', 'Example Two LLC'],
  evidence: [
    {
      kind: 'registry-mailing-address',
      url: 'https://data.sf.gov/resource/g8m3-pdis.json',
      checked: '2026-09-24',
      detail: 'Both companies list the same mailing address on their city registrations.',
    },
    {
      kind: 'group-website',
      url: 'https://example.com/our-restaurants',
      checked: '2026-09-24',
      detail: "The group's site lists both restaurants.",
    },
  ],
}

describe('RESTAURANT_GROUPS', () => {
  it('every curated row passes gate G6', () => {
    for (const g of RESTAURANT_GROUPS) expect(validateCuratedGroup(g)).toEqual([])
  })

  it('ids are unique', () => {
    const ids = RESTAURANT_GROUPS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('labels name brands, never the shared address', () => {
    for (const g of RESTAURANT_GROUPS) expect(g.label).not.toMatch(/^\d+\s/)
  })
})

describe('validateCuratedGroup (G6)', () => {
  it('accepts a well-formed row', () => {
    expect(validateCuratedGroup(valid)).toEqual([])
  })

  it('refuses a single evidence kind, even twice', () => {
    const g = { ...valid, evidence: [valid.evidence[0], { ...valid.evidence[0], url: 'https://example.com/x' }] }
    expect(validateCuratedGroup(g).join()).toMatch(/2\+ distinct evidence kinds/)
  })

  it('refuses a one-company group', () => {
    expect(validateCuratedGroup({ ...valid, companies: ['Example One LLC'] }).join()).toMatch(/2\+ registered companies/)
  })

  it('refuses http, the retired portal host, and impossible dates', () => {
    const bad = {
      ...valid,
      evidence: [
        { ...valid.evidence[0], url: 'http://example.com' },
        { ...valid.evidence[1], url: `https://${RETIRED_HOST}/resource/g8m3-pdis.json`, checked: '2026-02-30' },
      ],
    }
    const errs = validateCuratedGroup(bad).join('\n')
    expect(errs).toMatch(/must be https/)
    expect(errs).toMatch(/retired .* host/)
    expect(errs).toMatch(/checked date/)
  })

  it('refuses a non-slug id and an unknown evidence kind', () => {
    const g = {
      ...valid,
      id: 'Super Duper',
      evidence: [valid.evidence[0], { ...valid.evidence[1], kind: 'news-story' as never }],
    }
    const errs = validateCuratedGroup(g).join('\n')
    expect(errs).toMatch(/slug/)
    expect(errs).toMatch(/unknown evidence kind/)
  })
})
