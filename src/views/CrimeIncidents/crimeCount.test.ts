// SF crime rows are CHARGE-level and cases carry SUPPLEMENTAL reports, so
// count(*) counts charges-times-reports. These pins guard the three ways that
// correction can silently come undone: the two spellings drifting apart, the
// era strip's historical query inheriting a column that does not exist in the
// older extract, and a count(*) creeping back into an SF crime query.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { SF_CRIME_COUNT, HIST_CRIME_COUNT } from './crimeCount'
import { HISTORICAL_FIELDS } from './crimeEra'
import { SF_MANIFEST } from '@/cities/sf/manifest'
import { buildEraQuery, buildHistoricalEraQuery } from '@/api/eraSources'
import { countDistinctCases, distinctIncidents, distinctCases } from '@/hooks/useComparisonDataFactory'

const crimeEntry = SF_MANIFEST.find((e) => e.viewId === 'crime-incidents')!

describe('the counting unit', () => {
  it('counts distinct cases, not rows', () => {
    expect(SF_CRIME_COUNT).toBe('count(distinct incident_number)')
  })

  it('names the historical extract OWN case column', () => {
    // tmnf-yvry has no incident_number; using SF_CRIME_COUNT there is a 400.
    expect(HIST_CRIME_COUNT).toBe(`count(distinct ${HISTORICAL_FIELDS.incidentNumber})`)
    expect(HIST_CRIME_COUNT).not.toBe(SF_CRIME_COUNT)
  })
})

describe('the era strip counts cases in BOTH eras', () => {
  it('wires the modern extract', () => {
    expect(crimeEntry.eraSource?.countExpr).toBe(SF_CRIME_COUNT)
  })

  it('wires the historical extract with its own column', () => {
    expect(crimeEntry.eraSource?.historical?.countExpr).toBe(HIST_CRIME_COUNT)
  })

  it('would leave a ~10-point artificial step at the 2018 seam if either era were left on count(*)', () => {
    const modern = buildEraQuery(crimeEntry.eraSource!)
    const hist = buildHistoricalEraQuery(crimeEntry.eraSource!)!
    expect(modern.$select).toContain(SF_CRIME_COUNT)
    expect(hist.$select).toContain(HIST_CRIME_COUNT)
    expect(modern.$select).not.toContain('count(*)')
    expect(hist.$select).not.toContain('count(*)')
  })

  it('never lets the historical query inherit the parent countExpr', () => {
    // The bug this prevents is silent-then-fatal: the parent's expression
    // names a column the older extract does not have.
    const q = buildHistoricalEraQuery({
      datasetKey: 'a', dateField: 'd', clamp: [2000, null],
      countExpr: 'count(distinct parent_col)',
      historical: { datasetKey: 'b', dateField: 'e', untilYear: 2010 },
    })!
    expect(q.$select).not.toContain('parent_col')
    expect(q.$select).toContain('count(*)')
  })
})

describe('client-side dedupe (the 5K sample and both comparison sides)', () => {
  it('collapses a multi-charge, multi-report case to one', () => {
    const rows = [
      { incident_number: '260084806' }, { incident_number: '260084806' },
      { incident_number: '260084806' }, { incident_number: '250671407' },
    ]
    expect(rows.length).toBe(4)
    expect(distinctIncidents(rows)).toBe(2)
  })

  it('is idempotent, so a pre-deduped side and a raw side agree', () => {
    const raw = [{ incident_number: 'a' }, { incident_number: 'a' }, { incident_number: 'b' }]
    const deduped = [{ incident_number: 'a' }, { incident_number: 'b' }]
    expect(distinctIncidents(raw)).toBe(distinctIncidents(deduped))
  })

  it('counts an identifier-less row as its own case rather than merging them', () => {
    expect(distinctIncidents([{}, {}, { incident_number: 'a' }])).toBe(3)
  })

  it('keeps Oakland on casenumber', () => {
    expect(distinctCases([{ casenumber: 'x' }, { casenumber: 'x' }])).toBe(1)
    expect(countDistinctCases([{ k: 'x' }, { k: 'x' }], (r) => r.k)).toBe(1)
  })
})

describe('no SF crime query counts rows', () => {
  const files = [
    'src/views/CrimeIncidents/useCrimeEraData.ts',
    'src/hooks/usePoliceHourlyPattern.ts',
  ]
  for (const f of files) {
    it(`${f} has no count(*)`, () => {
      expect(readFileSync(f, 'utf8')).not.toContain('count(*)')
    })
  }

  it('the view feeds its trend baseline a case-level countExpr', () => {
    const src = readFileSync('src/views/CrimeIncidents/CrimeIncidents.tsx', 'utf8')
    expect(src).toContain('countExpr: SF_CRIME_COUNT')
  })
})

describe('the violent-crime ticker card links somewhere real', () => {
  // Shipped bug: params were { categories: 'violent' }, but the view parses
  // ?categories= as literal category names, so the card landed readers on an
  // empty view. Source-read because importing the hook pulls appStore ->
  // window.matchMedia, which the node-only suite has no DOM for.
  const ind = readFileSync('src/hooks/useCivicIndicators.ts', 'utf8')
  const view = readFileSync('src/views/CrimeIncidents/CrimeIncidents.tsx', 'utf8')

  it('no longer emits the shorthand the view cannot parse', () => {
    expect(ind).not.toContain("categories: 'violent'")
  })

  it('builds the link and the WHERE clause from one list', () => {
    const list = ind.match(/export const VIOLENT_CATEGORIES = \[(.*?)\]/s)?.[1]
    expect(list).toBeTruthy()
    const names = [...list!.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(names).toEqual(['Assault', 'Robbery', 'Homicide', 'Rape'])
    expect(ind).toContain('VIOLENT_CATEGORIES.join(\',\')')
    expect(ind).toContain('VIOLENT_CATEGORIES.map')
  })

  it('emits names the view splits on comma and matches literally', () => {
    expect(view).toContain("searchParams.get('categories')")
    expect(view).toContain("param.split(',').map(decodeURIComponent)")
    // A comma inside a category name would break that contract.
    expect(['Assault', 'Robbery', 'Homicide', 'Rape'].some((c) => c.includes(','))).toBe(false)
  })
})

describe('the subcategory mover ticker card', () => {
  const ind = readFileSync('src/hooks/useCivicIndicators.ts', 'utf8')

  it('exists and is registered in the fetch fan-out', () => {
    expect(ind).toContain('fetchCrimeSubcategoryMover')
    expect(ind).toMatch(/fetchCrimeSubcategoryMover\(ctx\),/)
  })

  it('counts cases, like every other SF crime query', () => {
    const fn = ind.slice(ind.indexOf('function fetchCrimeSubcategoryMover'))
      .slice(0, 2000)
    expect(fn).toContain('SF_CRIME_COUNT')
    expect(fn).not.toContain('count(*)')
  })

  it('ranks with the shared ranker rather than its own arithmetic', () => {
    expect(ind).toMatch(/topMover\(/)
  })

  it('deep-links with ?sub= pair keys', () => {
    expect(ind).toMatch(/params: \{ sub:/)
  })
})
