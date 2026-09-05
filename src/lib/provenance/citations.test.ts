import { describe, it, expect, beforeEach } from 'vitest'
import { recordCitation, clearCitationScope, slotKey, _resetCitations, _snapshot, type CitableQuery } from './citations'

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
})
