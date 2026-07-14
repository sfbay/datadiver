import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  UNMAPPABLE_PRECINCTS,
  buildElection,
  parseTurnout,
  precinctIds,
  raceIdFor,
  readXlsx,
  resolvePrecincts,
} from '../build-election-results.mjs'

describe('election results generator primitives', () => {
  it('keeps consolidated precinct labels as one entity with all members', () => {
    expect(precinctIds('1104/1105')).toEqual(['1104', '1105'])
  })

  it('pins the only permitted legacy geometry gap', async () => {
    expect(UNMAPPABLE_PRECINCTS).toEqual(['7055', '7056', '7649', '7651', '7652', '7653', '7654', '7655', '7656', '7657', '7876', '7959'])
    const sheets = readXlsx(await readFile('data/elections-src/20201103_sov.xlsx'))
    const turnout = parseTurnout(sheets[0], 'sov')
    const total = Object.entries(turnout).filter(([label]) => precinctIds(label).some((id) => UNMAPPABLE_PRECINCTS.includes(id))).reduce((sum, [, row]) => sum + row.registered, 0)
    expect(total).toBe(9544)
  })

  it('pins the June 2022 affected voters and never borrows a newer era', async () => {
    const sheets = readXlsx(await readFile('data/elections-src/20220607_sov.xlsx'))
    const turnout = parseTurnout(sheets[0], 'sov')
    const total = Object.entries(turnout).filter(([label]) => precinctIds(label).some((id) => UNMAPPABLE_PRECINCTS.includes(id))).reduce((sum, [, row]) => sum + row.registered, 0)
    expect(total).toBe(9410)
    expect(() => resolvePrecincts({ '7055': { ids: ['7055'], registered: 1, ballots: 1 } }, new Set(), 'prec_2012')).not.toThrow()
    expect(() => resolvePrecincts({ '7055': { ids: ['7055'], registered: 1, ballots: 1 } }, new Set(), 'prec_2022')).toThrow('7055')
    expect(() => resolvePrecincts({ '9999': { ids: ['9999'], registered: 1, ballots: 1 } }, new Set(), 'prec_2022')).toThrow('9999')
  })

  it('uses the pre-existing summary race id', async () => {
    const summary = JSON.parse(await readFile('public/data/elections/results/20241105/summary.json', 'utf8'))
    expect(raceIdFor('PRESIDENT AND VICE PRESIDENT', summary)).toBe('president-and-vice-president')
  })

  it('reports the suppressed precinct turnout residual', async () => {
    const manifest = JSON.parse(await readFile('data/elections-src/manifest.json', 'utf8'))
    const entry = manifest.elections.find((candidate) => candidate.dateCode === '20241105')
    const era = manifest.eras.find((candidate) => candidate.id === entry.era)
    const geojson = JSON.parse(await readFile('data/elections-src/prec_2022.geojson', 'utf8'))
    const geometryIds = new Set(geojson.features.map((f) => String(f.properties[era.idField])))

    const result = await buildElection(entry, geometryIds)

    expect(result.precinctTurnout.suppressed).toEqual({ registered: 1215, ballots: 983 })
  })
})
