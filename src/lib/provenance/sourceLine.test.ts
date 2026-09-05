import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CITIES } from '@/cities/registry'
import { summarizeSources, pillFace, throughLine, queryClause, citationLines } from './sourceLine'
import type { CitableQuery } from './citations'

const sfCrime = CITIES.sf.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfHousing = CITIES.sf.manifest.find((e) => e.viewId === 'housing')!
const sfTraffic = CITIES.sf.manifest.find((e) => e.viewId === 'traffic-safety')!
const oakCrime = CITIES.oakland.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfElections = CITIES.sf.manifest.find((e) => e.viewId === 'elections')!
const oak311 = CITIES.oakland.manifest.find((e) => e.viewId === '311-cases')!

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
  it('a non-empty citable that excludes map/window-sample must not flip a boundary-led view to static-led', () => {
    // Oakland 311 and parking-citations carry OPD's beat polygon (kind
    // 'boundary') as their ONLY static. Once either declares a real
    // `citable` set for its own purposes (stat-totals, freshness — neither
    // view draws its map dots from a citable purpose today), a
    // citable-EMPTY gate would flip the lead to static and print
    // "OPD · via DataDiver" over service requests / parking tickets that
    // have nothing to do with the police. This synthetic entry reproduces
    // that future shape today: it must still lead with the dataset.
    const synthCrime: typeof sfCrime = { ...sfCrime, citable: ['stat-totals', 'freshness'] }
    expect(summarizeSources('sf', synthCrime)[0].kind).toBe('dataset')
    const synth311: typeof oak311 = { ...oak311, citable: ['stat-totals', 'freshness'] }
    expect(summarizeSources('oakland', synth311)[0].kind).toBe('dataset')
  })
})

describe('summarizeSources dataset-group ordering', () => {
  it('promotes BOTH era keys (modern then historical) ahead of a same-view cross-reference dataset', () => {
    // sfCrime's declared `sources` is Task 5's scan order (alphabetical:
    // dispatch911Historical, policeIncidents, policeIncidentsHistorical) —
    // membership, not narrative order. The view's own two-extract series
    // (policeIncidents + its historical half) must lead the 911 lookup.
    const keys = summarizeSources('sf', sfCrime).filter((s) => s.kind === 'dataset').map((s) => s.key)
    expect(keys).toEqual(['policeIncidents', 'policeIncidentsHistorical', 'dispatch911Historical'])
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
  it('a freshness record for a DIFFERENT dataset → null, never looked up under the wrong completeness edge', () => {
    const f = rec({ purpose: 'freshness', datasetKey: 'policeIncidentsHistorical', rowCount: 1, hitLimit: false, head: [{ latest: '2026-09-01T00:00:00.000' }] })
    expect(throughLine({ cityId: 'sf', datasetKey: 'policeIncidents', freshness: f, nowYear: 2026 })).toBeNull()
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
  it('the Filtered clause is insertion-order INDEPENDENT — an explicit purpose priority, never first-write-wins', () => {
    const statTotals = rec({ purpose: 'stat-totals', params: { $where: 'a = 1' } })
    const scopeCount = rec({ purpose: 'scope-count', params: { $where: 'b = 2' } })
    const args = (records: CitableQuery[]) => ({ cityId: 'sf' as const, entry: sfCrime, records, portalTitles: {}, pageUrl: 'https://datadiver.jlabsf.org/crime-incidents', accessed: '2026-09-03' })
    const forward = citationLines(args([statTotals, scopeCount]))
    const backward = citationLines(args([scopeCount, statTotals]))
    expect(forward[0]).toBe(backward[0])
    // scope-count outranks stat-totals in the priority list, regardless of
    // which record resolved (and so was appended to `records`) first.
    expect(forward[0]).toContain('Filtered: b = 2')
  })
})

describe('the module never says Live', () => {
  // A house copy rule, not a coincidence: CLAUDE.md bans the word "Live" from
  // every reader-facing surface (Oakland's own chip renders "Updated …"
  // instead). Scans the WHOLE directory, not just sourceLine.ts — the rule
  // is about this feature's reader-facing prose wherever it lives, not one
  // file, so moving a label into a sibling module must still fail this.
  // Matches all three quote forms and is case-insensitive (a lower-case
  // "live" reads exactly the same way to a reader) while keeping the
  // \b word boundary so "deliver"/"lively"/"olive" never false-fire.
  // Character classes exclude newlines: this codebase's comments are prose
  // full of apostrophes ("the view's own dataset"), and a naive `[^']*`
  // greedily spans from that apostrophe clear across the file to the NEXT
  // single quote — which can land a real "live" INSIDE a comment several
  // lines away into what looks like one matched string. Reader-facing
  // string literals here are always single-line, so this loses nothing.
  const LIVE_IN_STRING = /'[^'\n]*\bLive\b[^'\n]*'|"[^"\n]*\bLive\b[^"\n]*"|`[^`\n]*\bLive\b[^`\n]*`/i
  const dir = join('src', 'lib', 'provenance')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  it('scans more than zero files (a broken glob would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(0)
  })
  for (const file of files) {
    it(`no reader-facing "Live" in ${file}`, () => {
      expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(LIVE_IN_STRING)
    })
  }
})
