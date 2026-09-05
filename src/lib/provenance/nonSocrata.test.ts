import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { NON_SOCRATA, NON_SOCRATA_IDS, nonSocrataFor } from './nonSocrata'

// NOT a direct `import` of scripts/fetch-cvr-sources.mjs: that module runs an
// un-guarded `main().catch(...)` at file scope, so importing it for its
// CVR_SOURCES export would also kick off a real 296MB network download (its
// sources live in gitignored data/elections-src/, so a fresh checkout has
// none of the files main() checks for first). Read the source text instead.
const cvrSourcesText = readFileSync('scripts/fetch-cvr-sources.mjs', 'utf8')

describe('NON_SOCRATA', () => {
  it('has the ten authored ids', () => {
    expect([...NON_SOCRATA_IDS].sort()).toEqual([
      'acs-2023-5yr', 'mapbox-basemap', 'oak-beats', 'oak-neighborhoods',
      'sf-analysis-neighborhoods', 'sf-cvr-20241105', 'sf-elections-results',
      'sf-precincts-2012', 'sf-precincts-2022', 'sf-tract-assignment',
    ])
  })
  it('every row carries publisher, title, vintage, upstream + landing URLs, and a city', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      expect(row.publisher.short.length, row.id).toBeGreaterThan(0)
      expect(row.publisher.full.length, row.id).toBeGreaterThan(0)
      expect(row.title.length, row.id).toBeGreaterThan(0)
      expect(row.vintage.length, row.id).toBeGreaterThan(0)
      expect(row.upstreamUrl, row.id).toMatch(/^https:\/\//)
      expect(row.landingUrl, row.id).toMatch(/^https:\/\//)
      expect(row.cities.length, row.id).toBeGreaterThan(0)
    }
  })
  it('no URL uses the dead geospatial export endpoint', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      expect(row.upstreamUrl).not.toMatch(/api\/geospatial/)
      expect(row.landingUrl).not.toMatch(/api\/geospatial/)
    }
  })
  it('served paths exist on disk', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      if (!row.servedPath) continue
      expect(existsSync(`public${row.servedPath}`), `${row.id} → ${row.servedPath}`).toBe(true)
    }
  })
  it('the elections row lists exactly the reachable elections in index.json', () => {
    // index.json shape: { generated, elections: [{ date, dateCode, type, label, races }] }
    const idx = JSON.parse(readFileSync('public/data/elections/index.json', 'utf8')) as { elections: { dateCode: string }[] }
    const listed = idx.elections.map((e) => e.dateCode).sort()
    expect(NON_SOCRATA['sf-elections-results'].elections!.map((e) => e.dateCode).sort()).toEqual(listed)
  })
  it('nonSocrataFor filters by city', () => {
    expect(nonSocrataFor('oakland').map((r) => r.id).sort()).toEqual(['acs-2023-5yr', 'mapbox-basemap', 'oak-beats', 'oak-neighborhoods'])
    expect(nonSocrataFor('sf').map((r) => r.id)).toContain('sf-analysis-neighborhoods')
  })
  it('election result URLs are internally consistent and stay pinned against rot', () => {
    for (const e of NON_SOCRATA['sf-elections-results'].elections!) {
      expect(e.sovUrl).toMatch(/sov\.xlsx$/)
      expect(e.dsovUrl).toMatch(/dsov\.xlsx$/)
      expect(e.certifiedDrop).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.sovUrl).toContain(`/results/${e.dateCode}/data/${e.certifiedDrop.replace(/-/g, '')}/`)
    }
  })
  it('the CVR upstream URL matches the fetch script byte-for-byte', () => {
    expect(cvrSourcesText).toContain(NON_SOCRATA['sf-cvr-20241105'].upstreamUrl)
  })
})
