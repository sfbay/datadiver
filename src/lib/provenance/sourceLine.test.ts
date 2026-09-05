import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CITIES } from '@/cities/registry'
import { summarizeSources, pillFace, throughLine, queryClause, citationLines } from './sourceLine'
import type { CitableQuery } from './citations'

const sfCrime = CITIES.sf.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfHousing = CITIES.sf.manifest.find((e) => e.viewId === 'housing')!
const sfTraffic = CITIES.sf.manifest.find((e) => e.viewId === 'traffic-safety')!
const oakCrime = CITIES.oakland.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfElections = CITIES.sf.manifest.find((e) => e.viewId === 'elections')!

const rec = (over: Partial<CitableQuery>): CitableQuery => ({
  cityId: 'sf', viewId: 'crime-incidents', purpose: 'map-sample', datasetKey: 'policeIncidents', datasetId: 'wg3w-h783', host: 'data.sfgov.org',
  params: { $where: "incident_datetime >= '2026-08-04T00:00:00'", $limit: 5000, $order: 'incident_datetime DESC' }, url: 'https://data.sfgov.org/resource/wg3w-h783.json?x',
  fetchedAt: 0, fromCache: false, rowCount: 5000, hitLimit: true, head: [], ...over,
})

describe('pillFace', () => {
  it('single publisher: short · portal · via DataDiver', () => {
    expect(pillFace(summarizeSources('sf', sfHousing))).toBe('SF Rent Board · DataSF · via DataDiver')
  })
  it('many publishers: N sources · via DataDiver', () => {
    expect(pillFace(summarizeSources('sf', sfTraffic))).toMatch(/^\d sources · via DataDiver$/)
  })
  it('static-led views lead with their first static source', () => {
    // Elections: results + two precinct layers + CVR share one publisher; the
    // neighborhood frame (SF Planning) is a second publisher, so the lead
    // group is 5 statics with 2 publishers → the count form.
    expect(pillFace(summarizeSources('sf', sfElections))).toBe('5 sources · via DataDiver')
    const demo = CITIES.sf.manifest.find((e) => e.viewId === 'demographics')!
    expect(summarizeSources('sf', demo)[0].id).toBe('acs-2023-5yr')
  })
  it('the Socrata sources lead on a dataset-led view and the boundary/census rows follow', () => {
    const s = summarizeSources('sf', sfCrime)
    expect(s[0].kind).toBe('dataset'); expect(s.at(-1)!.kind).toBe('static')
  })
})

describe('throughLine', () => {
  it('SF: published through the freshness MAX, AP style, no Date parsing', () => {
    const f = rec({ purpose: 'freshness', params: { $select: 'MAX(incident_datetime) as latest', $limit: 1 }, rowCount: 1, hitLimit: false, head: [{ latest: '2026-09-01T23:10:00.000' }] })
    expect(throughLine({ cityId: 'sf', datasetKey: 'policeIncidents', freshness: f, nowYear: 2026 })).toBe('Published through Sept. 1')
  })
  it('Oakland: complete through max − edge, newest row named', () => {
    const f = rec({ cityId: 'oakland', purpose: 'freshness', datasetId: 'ppgh-7dqv', host: 'data.oaklandca.gov', params: {}, rowCount: 1, hitLimit: false, head: [{ latest: '2026-09-03T04:00:00.000' }] })
    expect(throughLine({ cityId: 'oakland', datasetKey: 'policeIncidents', freshness: f, nowYear: 2026 })).toBe('Complete through Aug. 26 · newest row Sept. 3')
  })
  it('no freshness record → null (never fabricated)', () => {
    expect(throughLine({ cityId: 'sf', datasetKey: 'policeIncidents', freshness: undefined, nowYear: 2026 })).toBeNull()
  })
})

describe('queryClause', () => {
  it('shows $where/$select/$group only', () => {
    expect(queryClause(rec({}))).toBe("WHERE incident_datetime >= '2026-08-04T00:00:00'")
    expect(queryClause(rec({ params: { $select: 'count(*) as n', $where: 'a = 1', $group: 'b' } }))).toBe('SELECT count(*) as n WHERE a = 1 GROUP BY b')
  })
})

describe('citationLines', () => {
  it('SF dataset line is name-free and carries the filter + page URL', () => {
    const lines = citationLines({ cityId: 'sf', entry: sfCrime, records: [rec({})], portalTitles: { 'wg3w-h783': 'Police Department Incident Reports: 2018 to Present' }, pageUrl: 'https://datadiver.jlabsf.org/crime-incidents?start=2026-08-04', accessed: '2026-09-03' })
    expect(lines[0]).toBe("San Francisco Police Department. \"Police Department Incident Reports: 2018 to Present\" (wg3w-h783). DataSF, data.sfgov.org. Filtered: incident_datetime >= '2026-08-04T00:00:00'. Accessed Sept. 3, 2026, via DataDiver, https://datadiver.jlabsf.org/crime-incidents?start=2026-08-04.")
    expect(lines.join('\n')).not.toMatch(/Garnier|Claude/)
  })
  it('Oakland line uses the Oakland portal', () => {
    const lines = citationLines({ cityId: 'oakland', entry: oakCrime, records: [], portalTitles: {}, pageUrl: 'https://datadiver.jlabsf.org/oakland/crime-incidents', accessed: '2026-09-03' })
    expect(lines[0]).toMatch(/^Oakland Police Department\. "OPD Incident Reports" \(ppgh-7dqv\)\. Oakland Open Data, data\.oaklandca\.gov\. Accessed Sept\. 3, 2026, via DataDiver/)
  })
  it('a static row cites the upstream document', () => {
    const lines = citationLines({ cityId: 'sf', entry: sfElections, records: [], portalTitles: {}, pageUrl: 'https://datadiver.jlabsf.org/elections', accessed: '2026-09-03' })
    expect(lines[0]).toMatch(/^San Francisco Department of Elections\. "Statement of the Vote \(certified results\)"/)
  })
})

describe('the module never says Live', () => {
  it('no reader-facing "Live" in sourceLine.ts', () => {
    expect(readFileSync('src/lib/provenance/sourceLine.ts', 'utf8')).not.toMatch(/'[^']*\bLive\b[^']*'|`[^`]*\bLive\b[^`]*`/)
  })
})
