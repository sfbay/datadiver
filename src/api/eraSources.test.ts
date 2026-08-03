import { describe, it, expect } from 'vitest'
import {
  ERA_SOURCES, eraSourceForPath, buildEraQuery, buildHistoricalEraQuery, eraDomain,
} from './eraSources'
import { DATASETS } from './datasets'

describe('ERA_SOURCES integrity', () => {
  // The duplicated-allow-list lesson: a shared constant plus a pinning test,
  // not a hand-checked table. A typo here yields a 400 at runtime.
  it('every entry names a real dataset', () => {
    for (const [view, src] of Object.entries(ERA_SOURCES)) {
      expect(DATASETS[src.datasetKey], `${view} → ${src.datasetKey}`).toBeDefined()
    }
  })
  it('every clamp is ordered and plausible', () => {
    for (const [view, src] of Object.entries(ERA_SOURCES)) {
      const [lo, hi] = src.clamp
      expect(lo, view).toBeGreaterThanOrEqual(1990)
      if (hi != null) expect(hi, view).toBeGreaterThan(lo)
    }
  })
})

describe('eraSourceForPath', () => {
  it('resolves a registered route', () => {
    expect(eraSourceForPath('/crime-incidents')?.datasetKey).toBe('policeIncidents')
    expect(eraSourceForPath('/311-cases')?.datasetKey).toBe('cases311')
  })
  // These routes must NOT grow a history strip. /live in particular strips
  // start/end from the URL entirely.
  it('returns undefined for unregistered and non-ViewId routes', () => {
    for (const p of ['/', '/live', '/pulse', '/elections', '/city-budget', '/about']) {
      expect(eraSourceForPath(p), p).toBeUndefined()
    }
  })
  it('ignores deeper path segments rather than guessing', () => {
    expect(eraSourceForPath('/business/chain/12345')).toBeUndefined()
  })
})

describe('buildEraQuery', () => {
  it('groups by year with an open upper bound when unclamped', () => {
    const q = buildEraQuery(ERA_SOURCES['311-cases'])
    expect(q.$select).toBe('date_extract_y(requested_datetime) as yr, count(*) as n')
    expect(q.$group).toBe('yr')
    expect(q.$where).toBe("requested_datetime >= '2008-01-01'")
  })
  // SFPD ships two extracts that OVERLAP by 4.5 months. untilYear is the
  // modern query's floor precisely so those months are counted once.
  it('starts the modern query at untilYear when a historical extract exists', () => {
    expect(buildEraQuery(ERA_SOURCES['crime-incidents']).$where)
      .toBe("incident_datetime >= '2018-01-01'")
  })
  // Parking Citations publishes 1951–2044; both ends are junk. Without the
  // upper bound the axis renders 94 years of nothing.
  it('adds an upper bound when the source is clamped at both ends', () => {
    const q = buildEraQuery(ERA_SOURCES['parking-citations'])
    expect(q.$where).toBe(
      "citation_issued_datetime >= '2012-01-01' AND citation_issued_datetime < '2027-01-01'"
    )
  })
})

describe('eraDomain', () => {
  it('runs from the clamp floor to today when open-ended', () => {
    expect(eraDomain(ERA_SOURCES['crime-incidents'], '2026-08-03'))
      .toEqual({ start: '2003-01-01', end: '2026-08-03' })
  })
  it('stops at the clamp ceiling when closed', () => {
    expect(eraDomain(ERA_SOURCES['parking-citations'], '2026-08-03').end)
      .toBe('2026-08-03')
  })
})

describe('buildHistoricalEraQuery', () => {
  it('covers the clamp floor up to (not including) untilYear', () => {
    expect(buildHistoricalEraQuery(ERA_SOURCES['crime-incidents'])?.$where)
      .toBe("date >= '2003-01-01' AND date < '2018-01-01'")
  })
  it('is null for every source with a single extract', () => {
    for (const view of ['311-cases', 'housing', 'parking-citations']) {
      expect(buildHistoricalEraQuery(ERA_SOURCES[view]), view).toBeNull()
    }
  })
})

describe('clamp disclosure', () => {
  // A clamp that hides published rows must SAY so on the axis. A clamp that
  // merely matches the real data floor must not — a note there would be noise.
  it('parking-citations discloses; the others do not', () => {
    expect(ERA_SOURCES['parking-citations'].clampNote).toBeTruthy()
    for (const view of ['crime-incidents', '311-cases', 'housing']) {
      expect(ERA_SOURCES[view].clampNote, view).toBeUndefined()
    }
  })
})
