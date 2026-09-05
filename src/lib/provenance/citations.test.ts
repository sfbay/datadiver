import { describe, it, expect, beforeEach } from 'vitest'
import { recordCitation, clearCitationScope, clearCitationSlot, slotKey, _resetCitations, _snapshot, type CitableQuery } from './citations'

const base: CitableQuery = {
  cityId: 'sf', viewId: 'crime-incidents', purpose: 'map-sample', datasetKey: 'policeIncidents', datasetId: 'wg3w-h783',
  host: 'data.sfgov.org', params: { $limit: 5000 }, url: 'https://x/?a', fetchedAt: 1, fromCache: false, rowCount: 5000, hitLimit: true, head: [],
}

describe('citation recorder', () => {
  beforeEach(() => _resetCitations())
  it('keys slots by purpose|datasetKey|facet and replaces only its own slot', () => {
    recordCitation(base)
    recordCitation({ ...base, purpose: 'stat-totals', params: { $select: 'count(*)' }, url: 'https://x/?b', rowCount: 1, hitLimit: false })
    recordCitation({ ...base, url: 'https://x/?a2', fetchedAt: 2 })
    const recs = _snapshot('sf', 'crime-incidents')
    expect(recs.map((r) => r.url).sort()).toEqual(['https://x/?a2', 'https://x/?b'])
  })
  it('scopes by city — the same view in two cities never shares slots', () => {
    recordCitation(base)
    recordCitation({ ...base, cityId: 'oakland', datasetId: 'ppgh-7dqv', host: 'data.oaklandca.gov' })
    expect(_snapshot('sf', 'crime-incidents')).toHaveLength(1)
    expect(_snapshot('oakland', 'crime-incidents')).toHaveLength(1)
  })
  it('clearCitationScope empties one scope only', () => {
    recordCitation(base)
    recordCitation({ ...base, viewId: 'housing', datasetKey: 'evictionNotices' })
    clearCitationScope('sf', 'crime-incidents')
    expect(_snapshot('sf', 'crime-incidents')).toEqual([])
    expect(_snapshot('sf', 'housing')).toHaveLength(1)
  })
  it('slotKey includes the facet', () => {
    expect(slotKey('stat-totals', 'evictionNotices', 'No-fault share')).toBe('stat-totals|evictionNotices|No-fault share')
    expect(slotKey('map-sample', 'evictionNotices')).toBe('map-sample|evictionNotices|')
  })
  it('clearCitationSlot removes exactly one slot and its siblings survive', () => {
    recordCitation(base) // map-sample|policeIncidents
    recordCitation({ ...base, purpose: 'stat-totals', params: { $select: 'count(*)' }, url: 'https://x/?b', rowCount: 1, hitLimit: false })
    recordCitation({ ...base, viewId: 'housing', datasetKey: 'evictionNotices' })
    clearCitationSlot('sf', 'crime-incidents', 'map-sample', 'policeIncidents')
    const recs = _snapshot('sf', 'crime-incidents')
    expect(recs).toHaveLength(1)
    expect(recs[0].purpose).toBe('stat-totals')
    // A sibling scope (a different view entirely) is untouched.
    expect(_snapshot('sf', 'housing')).toHaveLength(1)
  })
  it('clearCitationSlot no-ops on an absent scope or slot, and never resurrects an empty scope', () => {
    // No scope exists yet for this (city, view) at all.
    clearCitationSlot('sf', 'crime-incidents', 'map-sample', 'policeIncidents')
    expect(_snapshot('sf', 'crime-incidents')).toEqual([])
    recordCitation(base)
    // A slot that was never recorded in an EXISTING scope.
    clearCitationSlot('sf', 'crime-incidents', 'stat-totals', 'policeIncidents')
    expect(_snapshot('sf', 'crime-incidents')).toHaveLength(1)
  })
  it('normalises view-slug casing so a case-variant route clears what the canonical id wrote', () => {
    // React Router matches routes case-insensitively while parseRoute leaves
    // the slug as-authored, so a visit to /Crime-Incidents must still clear
    // the scope that `cite: { viewId: 'crime-incidents' }` wrote.
    recordCitation(base) // viewId: 'crime-incidents' (canonical, lower-case)
    clearCitationScope('sf', 'Crime-Incidents')
    expect(_snapshot('sf', 'crime-incidents')).toEqual([])
  })
})
