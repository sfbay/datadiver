#!/usr/bin/env node
/** Build certified precinct and neighborhood election result assets. */
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'

export const UNMAPPABLE_PRECINCTS = Object.freeze([
  '7055', '7056', '7649', '7651', '7652', '7653', '7654', '7655', '7656', '7657', '7876', '7959',
])
const UNMAPPABLE = new Set(UNMAPPABLE_PRECINCTS)
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, trimValues: false })
const array = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value]
const text = (value) => {
  if (typeof value !== 'object' || value === null) return String(value ?? '')
  if ('#text' in value) return text(value['#text'])
  if ('t' in value) return array(value.t).map(text).join('')
  return Object.entries(value).filter(([key]) => !key.includes(':') && key !== 'rPr').map(([, child]) => text(child)).join('')
}
const clean = (value) => text(value).replace(/&#xD;&#xA;/gi, '\n').replace(/\r/g, '').trim()
const number = (value) => {
  const raw = clean(value).replace(/,/g, '')
  return raw === '' || /^n\/?a$/i.test(raw) ? 0 : Number(raw) || 0
}
const column = (ref) => { let n = 0; for (const char of ref.replace(/\d/g, '')) n = n * 26 + char.charCodeAt(0) - 64; return n - 1 }

/** Read a conventional XLSX ZIP archive without relying on an XLSX package. */
export function unzipXlsx(buffer) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('XLSX ZIP has no end-of-central-directory record')
  const count = buffer.readUInt16LE(eocd + 10), start = buffer.readUInt32LE(eocd + 16), files = new Map()
  let p = start
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid XLSX central-directory entry')
    const method = buffer.readUInt16LE(p + 10), compressed = buffer.readUInt32LE(p + 20), nameLength = buffer.readUInt16LE(p + 28), extraLength = buffer.readUInt16LE(p + 30), commentLength = buffer.readUInt16LE(p + 32), local = buffer.readUInt32LE(p + 42)
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString('utf8')
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}`)
    const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28), data = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed)
    if (method !== 0 && method !== 8) throw new Error(`Unsupported XLSX compression method ${method} for ${name}`)
    files.set(name, (method === 0 ? data : inflateRawSync(data)).toString('utf8'))
    p += 46 + nameLength + extraLength + commentLength
  }
  return files
}

export function readXlsx(buffer) {
  const files = unzipXlsx(buffer)
  const sharedXml = files.get('xl/sharedStrings.xml')
  const shared = sharedXml ? array(xml.parse(sharedXml).sst?.si).map(clean) : []
  const workbook = xml.parse(files.get('xl/workbook.xml') ?? '')
  const rels = xml.parse(files.get('xl/_rels/workbook.xml.rels') ?? '').Relationships?.Relationship ?? []
  const targets = new Map(array(rels).map((r) => [r.Id, r.Target.replace(/^\//, '').replace(/^xl\//, '')]))
  return array(workbook.workbook?.sheets?.sheet).map((sheet, index) => {
    const target = targets.get(sheet['r:id']) ?? `worksheets/sheet${index + 1}.xml`
    const part = target.startsWith('xl/') ? target : `xl/${target}`
    const worksheet = xml.parse(files.get(part) ?? '')
    return { name: sheet.name, rows: array(worksheet.worksheet?.sheetData?.row).map((row) => {
      const cells = []
      for (const cell of array(row.c)) {
        const at = column(cell.r ?? 'A1')
        let value = cell.v
        if (cell.t === 's') value = shared[number(value)] ?? ''
        else if (cell.t === 'inlineStr') value = cell.is
        cells[at] = clean(value)
      }
      return cells
    }) }
  })
}

export function precinctIds(label) { return [...label.matchAll(/\d{4}/g)].map((m) => m[0]) }
export function slugTitle(title) { return clean(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
function normalized(title) { return clean(title).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() }
function candidateKey(name) { return normalized(clean(name).replace(/\([^)]*\)/g, '')).replace(/\bQUALIFIED WRITE IN\b/g, '').replace(/\s+/g, ' ').trim() }
function titleAt(rows) { return clean(rows[1]?.[0] ?? rows.find((r) => clean(r[0]).startsWith('CONTEST:'))?.[0]).replace(/^CONTEST:\s*/i, '') }
function candidateHeaders(rows) { return rows[3] ?? [] }
function candidates(rows) {
  const header = candidateHeaders(rows), result = []
  for (let c = 6; c < header.length; c++) {
    const name = clean(header[c])
    if (name && !/^Total Votes$/i.test(name) && !/^Precinct$/i.test(name)) result.push({ name, col: c })
  }
  return result
}
function totalRows(rows, kind) {
  const results = new Map()
  let neighborhood = false
  for (const row of rows) {
    const label = clean(row[0])
    if (kind === 'dsov' && /^Neighborhood$/i.test(label)) { neighborhood = true; continue }
    if (kind === 'sov' && /^PCT\s+/i.test(label)) results.set(label.replace(/^PCT\s+/i, ''), null)
    if (kind === 'dsov' && neighborhood && / - Total$/i.test(label) && !/^(Cumulative|Neighborhood)$/i.test(label.replace(/ - Total$/i, ''))) results.set(label.replace(/ - Total$/i, ''), row)
    if (kind === 'sov' && /^Total$/i.test(label) && results.size) results.set([...results.keys()].at(-1), row)
  }
  return [...results].filter(([, row]) => row).map(([label, row]) => ({ label, row }))
}
export function parseTurnout(sheet, kind) {
  const rows = sheet.rows, totals = totalRows(rows, kind), header = rows.find((r) => /registered/i.test(clean(r[0])) || /registered/i.test(r.join(' '))) ?? []
  let registeredCol = header.findIndex((v) => /registered/i.test(clean(v))), ballotsCol = header.findIndex((v) => /voters cast|ballots cast/i.test(clean(v)))
  if (registeredCol < 0) { registeredCol = 3; ballotsCol = 4 }
  return Object.fromEntries(totals.map(({ label, row }) => [label, { registered: number(row[registeredCol]), ballots: number(row[ballotsCol]) }]))
}
export function parseContest(sheet, kind) {
  const title = titleAt(sheet.rows), people = candidates(sheet.rows), totals = totalRows(sheet.rows, kind)
  return { title, values: Object.fromEntries(totals.map(({ label, row }) => [label, { votes: Object.fromEntries(people.map(({ name, col }) => [name, number(row[col])])), total: people.reduce((sum, { col }) => sum + number(row[col]), 0) }])) }
}
function summaryRaces(summary) { return summary.races ?? [] }
export function raceIdFor(title, summary) {
  const hit = summaryRaces(summary).find((race) => normalized(race.title) === normalized(title))
  if (hit) return hit.id
  if (!summaryRaces(summary).length) return slugTitle(title)
  throw new Error(`Contest does not match summary.json: ${title}`)
}
export function resolvePrecincts(precincts, geometryIds, era) {
  const unknown = [], unmapped = []
  for (const [label, record] of Object.entries(precincts)) for (const id of record.ids) {
    if (/\sMB$/i.test(label) || (id === '9903' && record.registered === 0 && record.ballots === 0)) continue
    if (geometryIds.has(id)) continue
    if (era === 'prec_2012' && UNMAPPABLE.has(id)) unmapped.push(id)
    else unknown.push(id)
  }
  if (unknown.length) throw new Error(`Unresolved ${era} precinct ids: ${[...new Set(unknown)].join(', ')}`)
  return [...new Set(unmapped)]
}
function check(condition, message) { if (!condition) throw new Error(`Reconciliation failed: ${message}`) }
function outputPath(dateCode) { return join('public/data/elections/results', dateCode) }
async function loadElection(entry) {
  const [sovBuffer, dsovBuffer] = await Promise.all([readFile(entry.sov.file), readFile(entry.dsov.file)])
  const summaryPath = join(outputPath(entry.dateCode), 'summary.json')
  const summary = existsSync(summaryPath) ? JSON.parse(await readFile(summaryPath, 'utf8')) : { registration: null, races: [] }
  return { sov: readXlsx(sovBuffer), dsov: readXlsx(dsovBuffer), summary }
}
export async function buildElection(entry, geometryIds) {
  const { sov, dsov, summary } = await loadElection(entry)
  const precinctTurnoutRaw = Object.fromEntries(Object.entries(parseTurnout(sov[0], 'sov')).filter(([label]) => !/\sMB$/i.test(label))), neighborhoodTurnout = parseTurnout(dsov[0], 'dsov')
  const precincts = Object.fromEntries(Object.entries(precinctTurnoutRaw).map(([label, values]) => [label, { ids: precinctIds(label), ...values, turnout: values.registered ? values.ballots / values.registered : 0 }]))
  const unmappedIds = resolvePrecincts(precincts, geometryIds, entry.era)
  for (const row of Object.values(precincts)) if (row.ids.some((id) => unmappedIds.includes(id))) row.unmapped = true
  const precinctRegistration = Object.values(precincts).reduce((sum, row) => sum + row.registered, 0)
  const neighborhoodRegistration = Object.values(neighborhoodTurnout).reduce((sum, row) => sum + row.registered, 0)
  const neighborhoodBallots = Object.values(neighborhoodTurnout).reduce((sum, row) => sum + row.ballots, 0)
  const certified = summary.registration ?? { totalRegistered: neighborhoodRegistration, totalBallotsCast: neighborhoodBallots }
  const suppressed = { registered: neighborhoodRegistration - precinctRegistration, ballots: neighborhoodBallots - Object.values(precincts).reduce((sum, row) => sum + row.ballots, 0) }
  check(neighborhoodRegistration === certified.totalRegistered, `${entry.dateCode} registration ${neighborhoodRegistration} != ${certified.totalRegistered}`)
  check(neighborhoodBallots === certified.totalBallotsCast, `${entry.dateCode} ballots ${neighborhoodBallots} != ${certified.totalBallotsCast}`)
  check(suppressed.registered >= 0 && suppressed.ballots >= 0, `${entry.dateCode} negative suppressed residual`)
  const races = [], precinctRaceFiles = {}
  for (let i = 1; i < sov.length; i++) {
    const precinctContest = parseContest(sov[i], 'sov'); if (!precinctContest.title) continue
    const raceId = raceIdFor(precinctContest.title, summary)
    const neighborhoodSheet = dsov.find((sheet) => normalized(titleAt(sheet.rows)) === normalized(precinctContest.title))
    if (!neighborhoodSheet) throw new Error(`No neighborhood contest sheet for ${precinctContest.title}`)
    const neighborhoodContest = parseContest(neighborhoodSheet, 'dsov')
    const cityRace = summaryRaces(summary).find((race) => race.id === raceId)
    for (const candidate of cityRace?.candidates ?? []) {
      const sourceName = Object.keys(precinctContest.values).length ? Object.keys(Object.values(precinctContest.values)[0].votes).find((name) => candidateKey(name) === candidateKey(candidate.name)) : undefined
      const total = Object.values(precinctContest.values).reduce((sum, row) => sum + (sourceName ? row.votes[sourceName] ?? 0 : 0), 0)
      check(total <= candidate.totalVotes, `${entry.dateCode} ${raceId} ${candidate.name} ${total} exceeds ${candidate.totalVotes}`)
    }
    precinctContest.values = Object.fromEntries(Object.entries(precinctContest.values).filter(([label]) => label in precincts))
    precinctRaceFiles[raceId] = { dateCode: entry.dateCode, raceId, title: precinctContest.title, era: entry.era, precincts: precinctContest.values }
    races.push({ raceId, contest: neighborhoodContest })
  }
  const neighborhoods = Object.fromEntries(Object.entries(neighborhoodTurnout).map(([name, turnout]) => [name, { ...turnout, turnout: turnout.registered ? turnout.ballots / turnout.registered : 0, races: {} }]))
  for (const { raceId, contest } of races) for (const [name, values] of Object.entries(contest.values)) {
    if (!neighborhoods[name]) throw new Error(`Contest ${raceId} contains unknown neighborhood ${name}`)
    neighborhoods[name].races[raceId] = values
  }
  const unmappedRegistered = Object.entries(precincts).filter(([, row]) => row.ids.some((id) => unmappedIds.includes(id))).reduce((sum, [, row]) => sum + row.registered, 0)
  const nonMb = Object.keys(precincts).filter((label) => !/\sMB$/i.test(label)).length
  if (entry.dateCode === '20201103') check(unmappedIds.length === 12 && unmappedRegistered === 9544 && nonMb === 588, '2020 unmapped pin')
  if (entry.dateCode === '20220607') check(unmappedIds.length === 12 && unmappedRegistered === 9410 && nonMb === 589, '2022 unmapped pin')
  return { precinctTurnout: { dateCode: entry.dateCode, era: entry.era, precincts, suppressed, unmapped: { ids: unmappedIds, registered: unmappedRegistered } }, precinctRaceFiles, neighborhoods: { dateCode: entry.dateCode, scheme: entry.scheme, neighborhoods }, report: { dateCode: entry.dateCode, registration: neighborhoodRegistration, ballots: neighborhoodBallots, precinctRegistration, suppressed: suppressed.registered, unmapped: `${unmappedIds.length}/${nonMb} (${unmappedRegistered})`, races: races.length } }
}
async function main() {
  const args = new Set(process.argv.slice(2)); const checkOnly = args.has('--check'); const selfTest = args.has('--self-test'); const dateIndex = process.argv.indexOf('--date'); const onlyDate = dateIndex >= 0 ? process.argv[dateIndex + 1] : null
  if (!existsSync('data/elections-src/manifest.json')) throw new Error('Missing data/elections-src inputs')
  const manifest = JSON.parse(await readFile('data/elections-src/manifest.json', 'utf8'))
  const geometries = new Map(await Promise.all(manifest.eras.map(async (era) => {
    const geojson = JSON.parse(await readFile(era.file, 'utf8')); return [era.id, new Set(geojson.features.map((f) => String(f.properties[era.idField])))]
  })))
  const builds = []
  for (const entry of manifest.elections.filter((candidate) => !onlyDate || candidate.dateCode === onlyDate)) builds.push(await buildElection(entry, geometries.get(entry.era)))
  if (selfTest) { const changed = builds[0].precinctTurnout.precincts; const row = Object.values(changed)[0]; row.registered++; let caught = false; try { check(Object.values(changed).reduce((s, x) => s + x.registered, 0) + builds[0].precinctTurnout.suppressed.registered === builds[0].report.registration, 'self-test') } catch { caught = true } check(caught, 'self-test did not catch perturbation') }
  if (checkOnly) for (const build of builds) {
    const dir = outputPath(build.report.dateCode)
    const same = async (file, value) => check((await readFile(file, 'utf8')) === JSON.stringify(value), `emitted ${file} differs from source`)
    await same(join(dir, 'precincts/_turnout.json'), build.precinctTurnout)
    await same(join(dir, 'neighborhoods.json'), build.neighborhoods)
    for (const [id, value] of Object.entries(build.precinctRaceFiles)) await same(join(dir, `precincts/${id}.json`), value)
  }
  if (!checkOnly && !selfTest) for (const build of builds) {
    const dir = outputPath(build.report.dateCode); await rm(join(dir, 'precincts'), { recursive: true, force: true }); await mkdir(join(dir, 'precincts'), { recursive: true })
    await writeFile(join(dir, 'precincts/_turnout.json'), JSON.stringify(build.precinctTurnout))
    await Promise.all(Object.entries(build.precinctRaceFiles).map(([id, data]) => writeFile(join(dir, `precincts/${id}.json`), JSON.stringify(data))))
    await writeFile(join(dir, 'neighborhoods.json'), JSON.stringify(build.neighborhoods))
  }
  console.table(builds.map((b) => ({ election: b.report.dateCode, registration: `${b.report.registration} PASS`, ballots: `${b.report.ballots} PASS`, suppressed: `${b.report.suppressed} PASS`, unmapped: `${b.report.unmapped} PASS`, races: `${b.report.races} PASS` })))
}
if (process.argv[1]?.endsWith('build-election-results.mjs')) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
