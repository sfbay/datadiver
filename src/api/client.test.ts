import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchDataset, resolveQuery } from './client'
import { _resetCitations, _snapshot } from '@/lib/provenance/citations'

const cfg = { endpoint: 'https://data.sfgov.org/resource/wg3w-h783.json', defaultSort: 'incident_datetime DESC' }

describe('resolveQuery', () => {
  it('injects the default sort and limit for a row query', () => {
    const r = resolveQuery(cfg, { $where: "a = 'b'", $limit: 5000 })
    expect(r.queryParams).toEqual({ $order: 'incident_datetime DESC', $limit: 5000, $where: "a = 'b'" })
    expect(r.url).toBe("https://data.sfgov.org/resource/wg3w-h783.json?%24order=incident_datetime+DESC&%24limit=5000&%24where=a+%3D+%27b%27")
  })
  it('skips the default sort for an aggregate', () => {
    const r = resolveQuery(cfg, { $select: 'count(*) as n' })
    expect(r.queryParams.$order).toBeUndefined()
    expect(r.queryParams.$limit).toBe(1000)
  })
  it('never carries a token', () => {
    expect(resolveQuery(cfg, { $q: 'x' }).url).not.toMatch(/app_token/i)
  })
})

describe('the citation guard', () => {
  // A response can outlive the state that asked for it: move the date range
  // while a 5,000-row query is in flight and, if the old request lands last,
  // it used to overwrite its own citation slot — so the panel and the COPIED
  // CITATION carried the previous range's filter beside a map drawn from the
  // new one. Same race defeated the layer-toggle clear (switch an overlay on
  // then quickly off; the late response re-added the slot).
  const rows = [{ incident_number: '260084806' }]
  const cite = { viewId: 'crime-incidents', purpose: 'map-sample' } as const

  beforeEach(() => {
    _resetCitations()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rows })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('a guarded call whose guard has closed records nothing, but still returns its rows', async () => {
    const out = await fetchDataset('policeIncidents', { $where: "a = '1'" }, { cite, citeGuard: () => false })
    expect(out).toEqual(rows) // the caller's own cancellation handling is untouched
    expect(_snapshot('sf', 'crime-incidents')).toEqual([])
  })

  it('an open guard — or no guard at all — records exactly as before', async () => {
    await fetchDataset('policeIncidents', { $where: "a = '2'" }, { cite, citeGuard: () => true })
    await fetchDataset('policeIncidents', { $where: "a = '3'" }, { cite: { ...cite, purpose: 'stat-totals' } })
    expect(_snapshot('sf', 'crime-incidents').map((r) => r.purpose).sort()).toEqual(['map-sample', 'stat-totals'])
  })
})
