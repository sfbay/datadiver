import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { eraSourceFor, buildEraQuery, buildHistoricalEraQuery, eraDomain } from './eraSources'
import { CITIES } from '@/cities/registry'

// Every registered era source, across every city — the integrity suite runs
// on manifest entries so a stage-2 Oakland table inherits the same gates.
const registered = Object.values(CITIES).flatMap((city) =>
  city.manifest
    .filter((e) => e.eraSource)
    .map((e) => ({ city, view: e.viewId, src: e.eraSource! }))
)

describe('era source integrity (every city)', () => {
  // The duplicated-allow-list lesson: a shared constant plus a pinning test,
  // not a hand-checked table. A typo here yields a 400 at runtime.
  it('every entry names a real dataset in its OWN city registry', () => {
    for (const { city, view, src } of registered) {
      expect(city.datasets[src.datasetKey], `${city.id}/${view} → ${src.datasetKey}`).toBeDefined()
      if (src.historical) {
        expect(city.datasets[src.historical.datasetKey],
          `${city.id}/${view} → historical ${src.historical.datasetKey}`).toBeDefined()
      }
    }
  })
  it('every clamp is ordered and plausible', () => {
    for (const { city, view, src } of registered) {
      const [lo, hi] = src.clamp
      expect(lo, `${city.id}/${view}`).toBeGreaterThanOrEqual(1990)
      if (hi != null) expect(hi, `${city.id}/${view}`).toBeGreaterThan(lo)
    }
  })
  it('SF registers exactly the seven era views', () => {
    const sfViews = registered.filter((r) => r.city.id === 'sf').map((r) => r.view).sort()
    expect(sfViews).toEqual([
      '311-cases', 'crime-incidents', 'emergency-response', 'housing',
      'parking-citations', 'parking-revenue', 'traffic-safety',
    ])
  })
})

describe('eraSourceFor', () => {
  it('resolves SF registered views', () => {
    expect(eraSourceFor('sf', 'crime-incidents')?.datasetKey).toBe('policeIncidents')
    expect(eraSourceFor('sf', 'housing')?.datasetKey).toBe('evictionNotices')
    expect(eraSourceFor('sf', '311-cases')?.datasetKey).toBe('cases311')
  })
  it('returns undefined for unregistered views — including /live, which must never get a strip', () => {
    for (const view of ['live', 'business', 'home', 'pulse', 'elections', 'city-budget', 'about', 'live-feeds', 'nosuchview']) {
      expect(eraSourceFor('sf', view), view).toBeUndefined()
    }
  })
  it('resolves the three Oakland era views; everything else stays undefined', () => {
    expect(eraSourceFor('oakland', 'crime-incidents')?.clamp).toEqual([2004, null])
    expect(eraSourceFor('oakland', '311-cases')?.datasetKey).toBe('cases311')
    expect(eraSourceFor('oakland', 'parking-citations')?.dateField).toBe('ticket_iss')
    for (const view of ['campaign-finance', 'demographics', 'live', 'home', 'housing', 'elections']) {
      expect(eraSourceFor('oakland', view), view).toBeUndefined()
    }
  })
})

describe('buildEraQuery', () => {
  it('groups by year with an open upper bound when unclamped', () => {
    const q = buildEraQuery(eraSourceFor('sf', '311-cases')!)
    expect(q.$select).toBe('date_extract_y(requested_datetime) as yr, count(*) as n')
    expect(q.$group).toBe('yr')
    expect(q.$where).toBe("requested_datetime >= '2008-01-01'")
  })
  // SFPD ships two extracts that OVERLAP by 4.5 months. untilYear is the
  // modern query's floor precisely so those months are counted once.
  it('starts the modern query at untilYear when a historical extract exists', () => {
    expect(buildEraQuery(eraSourceFor('sf', 'crime-incidents')!).$where)
      .toBe("incident_datetime >= '2018-01-01'")
  })
  // Parking Citations publishes 1951–2044; both ends are junk. Without the
  // upper bound the axis renders 94 years of nothing.
  it('adds an upper bound when the source is clamped at both ends', () => {
    expect(buildEraQuery(eraSourceFor('sf', 'parking-citations')!).$where).toBe(
      "citation_issued_datetime >= '2012-01-01' AND citation_issued_datetime < '2027-01-01'"
    )
  })
  it('builds the Oakland crime query from the clamp floor with no upper bound', () => {
    expect(buildEraQuery(eraSourceFor('oakland', 'crime-incidents')!).$where)
      .toBe("datetime >= '2004-01-01'")
  })
  it('oakland crime counts distinct cases, not charge rows', () => {
    const q = buildEraQuery(eraSourceFor('oakland', 'crime-incidents')!)
    expect(q.$select).toBe('date_extract_y(datetime) as yr, count(distinct casenumber) as n')
  })
})

describe('eraDomain', () => {
  it('runs from the clamp floor to today when open-ended', () => {
    expect(eraDomain(eraSourceFor('sf', 'crime-incidents')!, '2026-08-03'))
      .toEqual({ start: '2003-01-01', end: '2026-08-03' })
  })
  it('stops at the clamp ceiling when closed', () => {
    expect(eraDomain(eraSourceFor('sf', 'parking-citations')!, '2026-08-03').end)
      .toBe('2026-08-03')
  })
})

describe('buildHistoricalEraQuery', () => {
  it('covers the clamp floor up to (not including) untilYear', () => {
    expect(buildHistoricalEraQuery(eraSourceFor('sf', 'crime-incidents')!)?.$where)
      .toBe("date >= '2003-01-01' AND date < '2018-01-01'")
  })
  it('is null for every source with a single extract', () => {
    for (const view of ['311-cases', 'housing', 'parking-citations']) {
      expect(buildHistoricalEraQuery(eraSourceFor('sf', view)!), view).toBeNull()
    }
  })
})

describe('clamp disclosure', () => {
  // A clamp that HIDES published rows must be disclosed — but in About's
  // sources table, not on the era axis. Jesse's ruling, Sep 2 2026, after the
  // Oakland note ("range clamped — published dates run back to 1950") was
  // read as a warning about the 2026 data on screen: it named the excluded
  // year and never the year the chart starts, and it was clipped mid-word at
  // every type scale. A warning worn by the chrome reads as a warning about
  // the numbers. Site-wide label audit banked as future work.
  const about = readFileSync('src/views/About/About.tsx', 'utf8')
  const noteFor = (id: string) =>
    about.match(new RegExp(`id: '${id}'[^}]*note: '([^']*)'`))?.[1] ?? ''

  it('no era source carries an axis note any more', () => {
    for (const city of ['sf', 'oakland'] as const) {
      for (const e of CITIES[city].manifest) {
        if (!e.eraSource) continue
        expect(e.eraSource, `${city}/${e.viewId}`).not.toHaveProperty('clampNote')
      }
    }
  })

  it('SF parking citations discloses its 1951–2044 clamp in the sources table', () => {
    const note = noteFor('ab4h-6ztd')
    expect(note).toMatch(/2044/)
    expect(note).toMatch(/clamp/i)
  })

  it('Oakland crime discloses its 2004 floor in the sources table', () => {
    const note = noteFor('ppgh-7dqv')
    expect(note).toMatch(/2004/)
  })
})
