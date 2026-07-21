/**
 * build-cvr-ballots.ts
 *
 * Generator for the CVR-powered RCV replay skin.
 *
 * Reads SF's certified Dominion CVR export zip (data/elections-src/cvr/),
 * folds every ballot's ranked pattern per precinct, and emits the committed
 * artifacts at public/data/elections/results/<dateCode>/cvr/ — gated so a
 * from-scratch tabulation of the emitted ballots reproduces SF's certified
 * round reports EXACTLY before anything is written:
 *
 *   Gate A  tabulate(decodeBallots(artifact)) deep-equals rcv/<raceId>.json
 *   Gate B  per-precinct as-cast rank-1 tallies match the published SOV
 *           (precincts/<raceId>.json), with the frozen exceptions below;
 *           residual accounting closes against neighborhoods.json
 *   Gate C  candidate roster bijection (CVR manifest ↔ round file) and
 *           precinct-id set equality vs geo/prec-2022.geojson
 *   Gate D  ballot conservation in every round
 *
 * Zip walk + mark-resolution rules are ported from the Task-0 probe
 * (`probe-cvr.mjs`), which reproduced SF's certified Nov 2024 CVR numbers
 * exactly (blanks 18,540; overvotes 1,381; effective first choices exact
 * across all 10 RCV races) — see docs/superpowers/specs and the task-6
 * brief for the Charter §13.102 rules this implements. Zip format precedent:
 * `build-election-results.mjs` (`unzipXlsx`, lines ~29-46).
 *
 * Module scope stays side-effect-free: src/lib/rcv/reconciliation.test.ts
 * imports the frozen exception constants from here; main() only runs under
 * the CLI entry guard at the bottom.
 *
 * Run:  npx tsx scripts/build-cvr-ballots.ts            regenerate cvr/ + PASS table
 *       npx tsx scripts/build-cvr-ballots.ts --check    rebuild in memory, byte-compare committed files
 *       npx tsx scripts/build-cvr-ballots.ts --self-test  perturb one group count, assert Gate A catches it
 *       flags: --date <dateCode> (default 20241105) · --race <raceId>
 */

import { readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { decodeBallots } from '../src/lib/rcv/ballots.js'
import { tabulate } from '../src/lib/rcv/tabulate.js'
import { OVERVOTE_TERMINATOR } from '../src/types/elections.js'
import type { CVRBallotArtifact, CVRManifest, RCVContest } from '../src/types/elections.js'

// ── Minimal CVR shape (Dominion CVR export JSON) ────────────────────
// Deliberately local/minimal — the raw CVR shape doesn't belong in src/.

export interface CvrMark {
  CandidateId: number
  Rank: number
  IsVote: boolean
  IsAmbiguous: boolean
}

export interface CvrContestEntry {
  Id: number
  // Untyped at the boundary on purpose: real callers hand this a JSON.parse
  // result (effectively `any`), and the test fixtures type their `Marks`
  // array as `unknown[]` too — each element is cast to CvrMark internally
  // where its fields are actually read.
  Marks: unknown[]
}

export interface CvrCard {
  Contests: CvrContestEntry[]
}

export interface CvrElement {
  IsCurrent?: boolean
  PrecinctPortionId?: number
  Cards: CvrCard[]
}

export interface CvrSession {
  Original: CvrElement
  Modified?: CvrElement
}

// ── Mark resolution (Charter §13.102, probe-proven) ─────────────────

/** Candidate `Type` lookup: candidate manifest id -> Type string. */
export type CandTypeById = Map<number, string>

function isWriteInType(type: string | undefined): boolean {
  return type === 'WriteIn' || type === 'Writein'
}

/**
 * Resolves a single contest entry into its canonical ranked pattern.
 *
 * Walks ranks 1..numOfRanks. A rank with no valid marks is skipped
 * (collapses to the next indicated rank). Two or more DISTINCT candidate
 * ids at one rank is an overvote: append -1 as a terminator and stop.
 * Two marks for the SAME candidate at one rank count as a single mark.
 * A WriteIn-type candidate mark skips its rank entirely (unresolved
 * write-in — no name-matching at this stage). An already-appended
 * candidate seen again at a later rank is disregarded (skip).
 *
 * `blank` is true iff there are zero valid (IsVote && !IsAmbiguous) marks
 * anywhere in the entry — independent of whether the pattern is empty
 * for other reasons.
 *
 * `pattern` is typed `number[] | null` to match the documented contract,
 * but `null` never occurs for a present entry — this function always
 * returns an array (possibly empty).
 */
export function resolveContest(
  entry: CvrContestEntry,
  numOfRanks: number,
  candTypeById: CandTypeById
): { pattern: number[] | null; blank: boolean } {
  const byRank = new Map<number, number[]>()
  for (const raw of entry.Marks) {
    const m = raw as CvrMark
    if (!m.IsVote || m.IsAmbiguous) continue
    let atRank = byRank.get(m.Rank)
    if (!atRank) {
      atRank = []
      byRank.set(m.Rank, atRank)
    }
    atRank.push(m.CandidateId)
  }

  const pattern: number[] = []
  const seen = new Set<number>()
  for (let r = 1; r <= numOfRanks; r++) {
    const marks = byRank.get(r)
    if (!marks || marks.length === 0) continue
    const distinct = [...new Set(marks)]
    if (distinct.length > 1) {
      pattern.push(-1)
      break
    }
    const cand = distinct[0]
    const type = candTypeById.get(cand)
    if (isWriteInType(type)) continue
    if (seen.has(cand)) continue
    seen.add(cand)
    pattern.push(cand)
  }

  return { pattern, blank: byRank.size === 0 }
}

/**
 * As-cast rank-1 resolution (SOV comparison semantics) — used to reconcile
 * per-precinct as-cast tallies against the certified Statement of Vote.
 * Unlike `resolveContest`, this looks ONLY at rank 1 and does not walk
 * subsequent ranks or collapse skipped ranks.
 */
export function asCastRank1(
  entry: CvrContestEntry,
  candTypeById: CandTypeById
): { kind: 'cand'; id: number } | { kind: 'writein' } | { kind: 'over' } | { kind: 'under' } {
  const marks = (entry.Marks as CvrMark[]).filter((m) => m.IsVote && !m.IsAmbiguous && m.Rank === 1)
  const distinct = [...new Set(marks.map((m) => m.CandidateId))]
  if (distinct.length === 0) return { kind: 'under' }
  if (distinct.length > 1) return { kind: 'over' }
  const type = candTypeById.get(distinct[0])
  if (isWriteInType(type)) return { kind: 'writein' }
  return { kind: 'cand', id: distinct[0] }
}

/**
 * Resolves which element of a session (Original vs Modified/adjudicated)
 * is authoritative. Modified wins when it is marked IsCurrent. Throws if
 * a Modified element exists but NEITHER element is marked IsCurrent — that
 * state is unexpected in the CVR export and should not be silently
 * resolved to a guess.
 */
export function currentElement(session: CvrSession): CvrElement {
  if (!session.Modified) return session.Original
  if (session.Modified.IsCurrent === true) return session.Modified
  if (session.Original.IsCurrent === true) return session.Original
  throw new Error('currentElement: session has Modified but neither element is IsCurrent')
}

// ── Zip walker (classic zip only; Task-0-proven, generalized from
//    unzipXlsx in build-election-results.mjs:29-46) ──────────────────

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LFH_SIG = 0x04034b50
const EOCD_SCAN_MAX = 65557 // 22-byte EOCD + max 65535-byte comment

export interface ZipEntryInfo {
  method: number
  csize: number
  lho: number
}

function findEOCD(buf: Buffer): number {
  const floor = Math.max(0, buf.length - EOCD_SCAN_MAX)
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('zipEntries: no End Of Central Directory record found')
}

/**
 * Walks a zip file's central directory and returns a name -> entry-info
 * map. Classic (non-zip64) zips only — throws 'zip64 unsupported' when the
 * entry count reads as the zip64 sentinel (0xffff) or the central-directory
 * offset reads as the zip64 sentinel (0xffffffff).
 */
export function zipEntries(buf: Buffer): Map<string, ZipEntryInfo> {
  const eocd = findEOCD(buf)
  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('zip64 unsupported')
  }

  const entries = new Map<string, ZipEntryInfo>()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CD_SIG) {
      throw new Error(`zipEntries: bad central directory header at offset ${p}`)
    }
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const lho = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, { method, csize, lho })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/**
 * Reads and decompresses a single zip entry's data given its central
 * directory info (from `zipEntries`). Supports method 0 (store, raw slice)
 * and method 8 (deflate, `zlib.inflateRawSync`); any other compression
 * method throws.
 */
export function readZipEntry(buf: Buffer, e: ZipEntryInfo): Buffer {
  const q = e.lho
  if (buf.readUInt32LE(q) !== LFH_SIG) {
    throw new Error(`readZipEntry: bad local file header at offset ${q}`)
  }
  const nameLen = buf.readUInt16LE(q + 26)
  const extraLen = buf.readUInt16LE(q + 28)
  const start = q + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + e.csize)
  if (e.method === 0) return Buffer.from(raw)
  if (e.method === 8) return inflateRawSync(raw)
  throw new Error(`readZipEntry: unsupported compression method ${e.method}`)
}

// ── Frozen reconciliation exceptions ────────────────────────────────
// Keys are `${dateCode}/${raceId}`. These are the ONLY tolerated
// divergences between CVR-derived tallies and the published record; each
// is a documented property of SF's certified publications, not of our
// parsing. Widening any of these requires the same evidence trail.

/** RCV contests with CVR ballots but no certified round report to gate
 *  against (SF published no treasurer round data for Nov 2024). Skipped
 *  entirely at artifact/gate stage; mirrored in `_manifest.json`. */
export const RECONCILIATION_BLOCKED = Object.freeze(['20241105/treasurer'])

/** SOV rows (precinct labels) the certified SOV withholds for a contest —
 *  the public CVR carries their real ballots. Excluded from Gate B's
 *  per-precinct equality; reconciled through the citywide residual against
 *  neighborhoods.json instead. */
export const SOV_CONTEST_WITHHELD: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '20241105/member-board-of-supervisors-district-3': ['9306'],
  '20241105/member-board-of-supervisors-district-7': ['9735'],
  '20241105/member-board-of-supervisors-district-11': ['1149'],
})

/** Allowed citywide Σ(sov − ours) for the unresolved write-in row (SOV
 *  credits a handful of write-in marks our as-cast resolution does not). */
export const SOV_WRITEIN_DELTA: Readonly<Record<string, number>> = Object.freeze({ '20241105/mayor': 4 })

/** Certified elimination order for exact minimum-vote ties, passed to
 *  tabulate as tieOrder. None needed for 20241105 — the reconciliation
 *  test pins that this stays empty for that date. */
export const TIE_ORDER_PINS: Readonly<Record<string, readonly string[]>> = Object.freeze({})

/** Sentinel precinct id for ballots the CVR itself cannot place. The Nov
 *  2024 export carries exactly 3 poll-ballot sessions (ScannedVote, no
 *  Modified element) with `PrecinctPortionId: 0` — an id absent from
 *  PrecinctPortionManifest. Probe-verified accounting: SF's certified RCV
 *  round totals COUNT these ballots (mayor grand 410,105 reproduces only
 *  with them), while both certified precinct reports exclude them (every
 *  per-precinct SOV row AND the dsov neighborhood sums reconcile exactly
 *  without them). They are round-countable but precinct-unattributable in
 *  SF's own record, so the artifact mirrors that: their groups live under
 *  this sentinel, which joins no geometry (unpainted, like the withheld
 *  precincts) and never enters Gate B's SOV/residual comparisons. Only
 *  PrecinctPortionId 0 may fall back here — any other unknown id throws. */
export const UNATTRIBUTED_PRECINCT = '0000'

// ── Candidate-name join (ported from build-election-results.mjs:76) ──

const WRITEIN_KEY = 'WRITE IN'

function cleanText(value: string): string {
  return value.replace(/&#xD;&#xA;/gi, '\n').replace(/\r/g, '').trim()
}

function normalizedTitle(title: string): string {
  return cleanText(title).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** Normalization every candidate-name join goes through: strip parenthetical
 *  content, strip the QUALIFIED WRITE IN suffix, A-Z0-9 + single spaces.
 *  A bare write-in row ("Write-in") normalizes to "WRITE IN". */
export function candidateKey(name: string): string {
  return normalizedTitle(cleanText(name).replace(/\([^)]*\)/g, ''))
    .replace(/\bQUALIFIED WRITE IN\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reconciliation failed: ${message}`)
}

// ── Committed-file + manifest shapes (local, minimal) ───────────────

interface ContestManifestEntry { Description: string; Id: number; NumOfRanks: number }
interface CandidateManifestEntry { Description: string; Id: number; ContestId: number; Type: string; Disabled: number }
interface PortionManifestEntry { Description: string; Id: number; ExternalId: string | number }
interface SovPrecinctFile { precincts: Record<string, { votes: Record<string, number>; total: number }> }
interface NeighborhoodsFile { neighborhoods: Record<string, { races: Record<string, { votes: Record<string, number> }> }> }
interface TurnoutFile { precincts: Record<string, { ids: string[] }> }
interface GeoFile { features: { properties: { id: string } }[] }
interface SummaryFile { races: { id: string; title: string }[] }

// ── Context: paths, zip, manifests ──────────────────────────────────

interface RaceInfo {
  contestId: number
  raceId: string
  /** `${dateCode}/${raceId}` — key space of the frozen exception tables. */
  raceKey: string
  ranks: number
}

interface Context {
  dateCode: string
  resultsDir: string
  cvrDir: string
  zip: Buffer
  entries: Map<string, ZipEntryInfo>
  races: RaceInfo[]
  candTypeById: CandTypeById
  candDescById: Map<number, string>
  rosterByContest: Map<number, CandidateManifestEntry[]>
  portionToPrecinct: Map<number, string>
  /** All manifest-derived precinct ids, sorted ascending. */
  allPrecincts: string[]
  /** Precinct ids with a _turnout row (via row.ids, robust to consolidation). */
  turnoutIds: Set<string>
  geoIds: Set<string>
  neighborhoods: NeighborhoodsFile
  outstackDesc: Map<number, string>
}

function readJsonEntry<T>(ctx: Pick<Context, 'zip' | 'entries'>, name: string): T {
  const e = ctx.entries.get(name)
  if (!e) throw new Error(`zip entry missing: ${name}`)
  return JSON.parse(readZipEntry(ctx.zip, e).toString('utf8')) as T
}

function loadContext(dateCode: string): Context {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const resultsDir = join(root, 'public/data/elections/results', dateCode)
  const srcDir = join(root, 'data/elections-src/cvr', dateCode)
  check(existsSync(resultsDir), `no committed results for ${dateCode} at ${resultsDir}`)
  check(existsSync(srcDir), `no CVR sources for ${dateCode} at ${srcDir} — run scripts/fetch-cvr-sources.mjs`)
  const zips = readdirSync(srcDir).filter((n) => n.endsWith('.zip'))
  check(zips.length === 1, `expected exactly one CVR zip in ${srcDir}, found ${zips.length}`)

  console.error(`reading ${zips[0]}…`)
  const zip = readFileSync(join(srcDir, zips[0]))
  const entries = zipEntries(zip)
  const partial = { zip, entries }

  const summary = JSON.parse(readFileSync(join(resultsDir, 'summary.json'), 'utf8')) as SummaryFile
  const contests = readJsonEntry<{ List: ContestManifestEntry[] }>(partial, 'ContestManifest.json').List
  const races: RaceInfo[] = contests
    .filter((c) => c.NumOfRanks > 1)
    .map((c) => {
      // raceIdFor pattern (build-election-results.mjs:110-115): normalized-title
      // match against summary.json races; a non-match is a hard error.
      const hit = summary.races.find((r) => normalizedTitle(r.title) === normalizedTitle(c.Description))
      if (!hit) throw new Error(`CVR contest does not match summary.json: ${c.Description}`)
      return { contestId: c.Id, raceId: hit.id, raceKey: `${dateCode}/${hit.id}`, ranks: c.NumOfRanks }
    })

  const candList = readJsonEntry<{ List: CandidateManifestEntry[] }>(partial, 'CandidateManifest.json').List
  const candTypeById: CandTypeById = new Map(candList.map((c) => [c.Id, c.Type]))
  const candDescById = new Map(candList.map((c) => [c.Id, c.Description]))
  const rosterByContest = new Map<number, CandidateManifestEntry[]>()
  for (const c of candList) {
    if (c.Disabled) continue
    if (c.Type !== 'Regular' && c.Type !== 'QualifiedWriteIn') continue
    let roster = rosterByContest.get(c.ContestId)
    if (!roster) rosterByContest.set(c.ContestId, (roster = []))
    roster.push(c)
  }

  const portions = readJsonEntry<{ List: PortionManifestEntry[] }>(partial, 'PrecinctPortionManifest.json').List
  const portionToPrecinct = new Map<number, string>()
  for (const pp of portions) {
    const m = /^PCT (\d{4})/.exec(pp.Description)
    if (!m) throw new Error(`unparseable precinct portion: ${JSON.stringify(pp)}`)
    const ext = String(pp.ExternalId).split('-')[0]
    if (ext !== m[1]) throw new Error(`portion id mismatch: ${pp.Description} vs ${pp.ExternalId}`)
    portionToPrecinct.set(pp.Id, m[1])
  }
  const allPrecincts = [...new Set(portionToPrecinct.values())].sort()

  const turnout = JSON.parse(readFileSync(join(resultsDir, 'precincts/_turnout.json'), 'utf8')) as TurnoutFile
  const turnoutIds = new Set<string>()
  for (const row of Object.values(turnout.precincts)) for (const id of row.ids) turnoutIds.add(id)

  const geo = JSON.parse(
    readFileSync(join(root, 'public/data/elections/geo/prec-2022.geojson'), 'utf8'),
  ) as GeoFile
  const geoIds = new Set(geo.features.map((f) => f.properties.id))

  const neighborhoods = JSON.parse(readFileSync(join(resultsDir, 'neighborhoods.json'), 'utf8')) as NeighborhoodsFile
  const outstack = readJsonEntry<{ List: { Description: string; Id: number }[] }>(partial, 'OutstackConditionManifest.json').List
  return {
    dateCode, resultsDir, cvrDir: join(resultsDir, 'cvr'), zip, entries, races,
    candTypeById, candDescById, rosterByContest, portionToPrecinct, allPrecincts,
    turnoutIds, geoIds, neighborhoods, outstackDesc: new Map(outstack.map((o) => [o.Id, o.Description])),
  }
}

// ── Accumulation: one streaming pass over every CvrExport batch ─────

interface RaceAccumulator {
  info: RaceInfo
  ballots: number
  /** Citywide canonical-pattern counts, candidate-ID space, key = ids.join(','). */
  citywidePatterns: Map<string, number>
  /** precinct -> pattern key -> count. */
  byPrecinct: Map<string, Map<string, number>>
  /** precinct -> (candidate id | 'WRITEIN') -> as-cast rank-1 count. */
  asCast: Map<string, Map<number | 'WRITEIN', number>>
  asCastOver: number
  asCastUnder: number
  /** Contest-entry OutstackConditionId histogram (log-only, for gate debugging). */
  outstack: Map<number, number>
}

function accumulate(ctx: Context): Map<string, RaceAccumulator> {
  const byContestId = new Map<number, RaceAccumulator>()
  for (const info of ctx.races) {
    byContestId.set(info.contestId, {
      info, ballots: 0,
      citywidePatterns: new Map(), byPrecinct: new Map(), asCast: new Map(),
      asCastOver: 0, asCastUnder: 0, outstack: new Map(),
    })
  }

  const batchNames = [...ctx.entries.keys()].filter((n) => n.startsWith('CvrExport_'))
  let done = 0
  for (const name of batchNames) {
    const batch = readJsonEntry<{ Sessions: CvrSession[] }>(ctx, name)
    for (const session of batch.Sessions) {
      const el = currentElement(session)
      let precinct = ctx.portionToPrecinct.get(el.PrecinctPortionId as number)
      if (precinct === undefined) {
        // See UNATTRIBUTED_PRECINCT: PrecinctPortionId 0 is the CVR's own
        // "no precinct" state (3 sessions in 20241105). Anything else is a
        // parse/manifest problem and stays loud.
        if (el.PrecinctPortionId !== 0) throw new Error(`${name}: unknown PrecinctPortionId ${el.PrecinctPortionId}`)
        precinct = UNATTRIBUTED_PRECINCT
      }
      for (const card of el.Cards) {
        for (const entry of card.Contests) {
          const acc = byContestId.get(entry.Id)
          if (!acc) continue
          acc.ballots++
          const { pattern } = resolveContest(entry, acc.info.ranks, ctx.candTypeById)
          const key = (pattern ?? []).join(',')
          acc.citywidePatterns.set(key, (acc.citywidePatterns.get(key) ?? 0) + 1)
          let prec = acc.byPrecinct.get(precinct)
          if (!prec) acc.byPrecinct.set(precinct, (prec = new Map()))
          prec.set(key, (prec.get(key) ?? 0) + 1)
          const r1 = asCastRank1(entry, ctx.candTypeById)
          if (r1.kind === 'over') acc.asCastOver++
          else if (r1.kind === 'under') acc.asCastUnder++
          else {
            let m = acc.asCast.get(precinct)
            if (!m) acc.asCast.set(precinct, (m = new Map()))
            const k = r1.kind === 'writein' ? 'WRITEIN' : r1.id
            m.set(k, (m.get(k) ?? 0) + 1)
          }
          const conditions = (entry as CvrContestEntry & { OutstackConditionIds?: number[] }).OutstackConditionIds
          for (const id of conditions ?? []) acc.outstack.set(id, (acc.outstack.get(id) ?? 0) + 1)
        }
      }
    }
    done++
    if (done % 5000 === 0) console.error(`…${done}/${batchNames.length} batches`)
  }
  console.error(`…${done}/${batchNames.length} batches — accumulation done`)

  const byRaceId = new Map<string, RaceAccumulator>()
  for (const acc of byContestId.values()) byRaceId.set(acc.info.raceId, acc)
  return byRaceId
}

function logOutstackHistogram(ctx: Context, acc: RaceAccumulator): void {
  const rows = [...acc.outstack.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${ctx.outstackDesc.get(id) ?? `#${id}`}: ${n}`)
  console.error(`outstack histogram for ${acc.info.raceId}: ${rows.join(' · ') || '(none)'}`)
}

// ── Artifact build (Gate C inside) ──────────────────────────────────

/** Gate C part 1: perfect bijection CVR roster (Regular + QualifiedWriteIn,
 *  non-Disabled) ↔ committed round file's R1 names, via candidateKey. */
function buildCandidateIndexMap(
  roster: CandidateManifestEntry[], roundNames: string[], raceId: string,
): Map<number, number> {
  const idxByKey = new Map<string, number>()
  roundNames.forEach((name, i) => {
    const key = candidateKey(name)
    check(key.length > 0, `Gate C ${raceId}: round-file candidate ${JSON.stringify(name)} normalizes to an empty key`)
    check(!idxByKey.has(key), `Gate C ${raceId}: round-file candidates collide on key "${key}"`)
    idxByKey.set(key, i)
  })
  const idToIdx = new Map<number, number>()
  const claimed = new Set<number>()
  for (const cand of roster) {
    const idx = idxByKey.get(candidateKey(cand.Description))
    check(idx !== undefined, `Gate C ${raceId}: CVR candidate ${JSON.stringify(cand.Description)} (id ${cand.Id}) has no round-file match`)
    check(!claimed.has(idx), `Gate C ${raceId}: two CVR candidates map to round-file name ${JSON.stringify(roundNames[idx])}`)
    claimed.add(idx)
    idToIdx.set(cand.Id, idx)
  }
  check(
    claimed.size === roundNames.length,
    `Gate C ${raceId}: roster size ${roster.length} != round-file candidate count ${roundNames.length}`,
  )
  return idToIdx
}

function buildArtifact(
  ctx: Context, acc: RaceAccumulator, committed: RCVContest,
): { artifact: CVRBallotArtifact; idToIdx: Map<number, number> } {
  const { raceId } = acc.info
  const roster = ctx.rosterByContest.get(acc.info.contestId) ?? []
  const roundNames = committed.rounds[0].candidates.map((c) => c.name)
  const idToIdx = buildCandidateIndexMap(roster, roundNames, raceId)

  // Gate C part 2: manifest-derived precinct ids === emitted geometry ids.
  check(
    ctx.allPrecincts.length === ctx.geoIds.size && ctx.allPrecincts.every((p) => ctx.geoIds.has(p)),
    `Gate C ${raceId}: CVR precinct ids (${ctx.allPrecincts.length}) != prec-2022 geometry ids (${ctx.geoIds.size})`,
  )

  // The unattributed sentinel joins the precinct list only when this race
  // actually has portion-0 ballots (mayor + the 3 citywide offices + D5/D7/
  // D9 for 20241105). It sorts first ("0000" < "1101"), joins no geometry,
  // and is deliberately NOT in sovSuppressed — sovSuppressed means "real
  // precinct SF withheld from the SOV", and Gate B's residual must sum over
  // exactly that set (the certified dsov excludes portion-0 ballots too).
  const precincts = acc.byPrecinct.has(UNATTRIBUTED_PRECINCT)
    ? [UNATTRIBUTED_PRECINCT, ...ctx.allPrecincts].sort()
    : ctx.allPrecincts
  const sovSuppressed = precincts.filter((p) => p !== UNATTRIBUTED_PRECINCT && !ctx.turnoutIds.has(p))

  // Patterns: remap candidate-ID space -> artifact-index space, then sort by
  // (citywide count desc, joined-key asc). The key->index map is built AFTER
  // the sort; groups emit the remapped indices.
  const entries = [...acc.citywidePatterns.entries()].map(([idKey, count]) => {
    const pattern = idKey === ''
      ? []
      : idKey.split(',').map((s) => {
          const id = Number(s)
          if (id === OVERVOTE_TERMINATOR) return OVERVOTE_TERMINATOR
          const idx = idToIdx.get(id)
          check(idx !== undefined, `${raceId}: pattern references candidate id ${id} outside the Gate C roster`)
          return idx
        })
    return { idKey, pattern, sortKey: pattern.join(','), count }
  })
  entries.sort((a, b) => b.count - a.count || (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  const posByIdKey = new Map(entries.map((e, i) => [e.idKey, i]))

  const precinctIdx = new Map(precincts.map((p, i) => [p, i]))
  const groups: number[] = []
  const byPrecinct = [...acc.byPrecinct.entries()]
    .map(([label, m]) => {
      const idx = precinctIdx.get(label)
      check(idx !== undefined, `${raceId}: ballots in precinct ${label} not present in the portion manifest`)
      return { idx, m }
    })
    .sort((a, b) => a.idx - b.idx)
  for (const { idx, m } of byPrecinct) {
    const triples = [...m.entries()]
      .map(([idKey, count]) => ({ pat: posByIdKey.get(idKey)!, count }))
      .sort((a, b) => a.pat - b.pat)
    for (const t of triples) groups.push(idx, t.pat, t.count)
  }

  const emittedBallots = entries.reduce((s, e) => s + e.count, 0)
  check(emittedBallots === acc.ballots, `${raceId}: pattern counts sum ${emittedBallots} != accumulated ballots ${acc.ballots}`)

  const artifact: CVRBallotArtifact = {
    formatVersion: 1,
    dateCode: ctx.dateCode,
    raceId,
    candidates: roundNames,
    precincts,
    sovSuppressed,
    title: committed.title,
    patterns: entries.map((e) => e.pattern),
    groups,
  }
  return { artifact, idToIdx }
}

// ── Gate A: from-scratch tabulation reproduces the certified rounds ──

function gateA(artifact: CVRBallotArtifact, committed: RCVContest, raceKey: string): ReturnType<typeof tabulate> {
  const out = tabulate(
    decodeBallots(artifact),
    { raceId: artifact.raceId, title: artifact.title, candidates: artifact.candidates },
    { tieOrder: TIE_ORDER_PINS[raceKey] },
  )
  const ours = JSON.stringify(out.contest)
  const certified = JSON.stringify(committed)
  if (ours !== certified) {
    let detail = 'contest-level fields differ (title/totalRounds/winner)'
    const max = Math.max(out.contest.rounds.length, committed.rounds.length)
    for (let r = 0; r < max; r++) {
      const a = JSON.stringify(out.contest.rounds[r])
      const b = JSON.stringify(committed.rounds[r])
      if (a !== b) {
        detail = `round ${r + 1} differs\n  ours:      ${(a ?? 'missing').slice(0, 400)}\n  certified: ${(b ?? 'missing').slice(0, 400)}`
        break
      }
    }
    check(false, `Gate A ${artifact.raceId}: tabulation does not reproduce the certified rounds — ${detail}`)
  }
  return out
}

// ── Gate B: as-cast rank-1 vs the published SOV + residual closure ──

function sumVotesByKey(target: Map<string, number>, votes: Record<string, number>): void {
  for (const [name, n] of Object.entries(votes)) {
    const key = candidateKey(name) || WRITEIN_KEY
    target.set(key, (target.get(key) ?? 0) + n)
  }
}

function ourKeyedTallies(ctx: Context, acc: RaceAccumulator, precinct: string): Map<string, number> {
  const out = new Map<string, number>()
  const m = acc.asCast.get(precinct)
  if (!m) return out
  for (const [k, n] of m) {
    const key = k === 'WRITEIN' ? WRITEIN_KEY : candidateKey(ctx.candDescById.get(k) ?? `#${k}`)
    out.set(key, (out.get(key) ?? 0) + n)
  }
  return out
}

function gateB(ctx: Context, acc: RaceAccumulator, artifact: CVRBallotArtifact): void {
  const { raceId, raceKey } = acc.info
  const sovFile = JSON.parse(
    readFileSync(join(ctx.resultsDir, `precincts/${raceId}.json`), 'utf8'),
  ) as SovPrecinctFile
  const withheldRows = new Set(SOV_CONTEST_WITHHELD[raceKey] ?? [])

  // Per-precinct: named candidates exact; write-in ours ≤ sov with the
  // citywide delta pinned to SOV_WRITEIN_DELTA. Withheld rows are skipped
  // here and reconciled through the residual below.
  const failures: string[] = []
  let writeinDelta = 0
  for (const [label, row] of Object.entries(sovFile.precincts)) {
    if (withheldRows.has(label)) continue
    const ours = ourKeyedTallies(ctx, acc, label)
    const sov = new Map<string, number>()
    sumVotesByKey(sov, row.votes)
    for (const [key, sovVotes] of sov) {
      const ourVotes = ours.get(key) ?? 0
      if (key === WRITEIN_KEY) {
        if (ourVotes > sovVotes) failures.push(`${label} write-in: ours ${ourVotes} > sov ${sovVotes}`)
        writeinDelta += sovVotes - ourVotes
      } else if (ourVotes !== sovVotes) {
        failures.push(`${label} ${key}: ours ${ourVotes} != sov ${sovVotes}`)
      }
    }
    if (failures.length >= 12) break
  }
  check(
    failures.length === 0,
    `Gate B ${raceId}: per-precinct as-cast tallies diverge from the SOV — ${failures.length}+ rows, first: ${failures.slice(0, 6).join(' | ')}`,
  )
  const allowedDelta = SOV_WRITEIN_DELTA[raceKey] ?? 0
  check(
    writeinDelta === allowedDelta,
    `Gate B ${raceId}: citywide write-in Σ(sov − ours) = ${writeinDelta}, frozen allowance is ${allowedDelta}`,
  )

  // Residual: what the published SOV omits (the sovSuppressed precincts ∪
  // this race's withheld rows) must equal, per named candidate, the gap
  // between citywide neighborhoods.json sums and published SOV sums.
  // Accounting identity: the omission is ours MINUS what the SOV already
  // published at the withheld rows — D7's 9735 row is withheld yet credits
  // Melgar 1 vote (probe-verified), so nbhd − sov = 475 − 1 = 474 there;
  // for fully-zeroed withheld rows the subtrahend is 0. The unattributed
  // portion-0 ballots are OUTSIDE all three ledgers by construction.
  const nbhdSums = new Map<string, number>()
  for (const hood of Object.values(ctx.neighborhoods.neighborhoods)) {
    const race = hood.races[raceId]
    if (race) sumVotesByKey(nbhdSums, race.votes)
  }
  const sovSums = new Map<string, number>()
  for (const row of Object.values(sovFile.precincts)) sumVotesByKey(sovSums, row.votes)
  const withheldSet = new Set<string>([...artifact.sovSuppressed, ...withheldRows])
  const ourWithheld = new Map<string, number>()
  for (const label of withheldSet) {
    for (const [key, n] of ourKeyedTallies(ctx, acc, label)) {
      ourWithheld.set(key, (ourWithheld.get(key) ?? 0) + n)
    }
  }
  const sovAtWithheldRows = new Map<string, number>()
  for (const label of withheldRows) {
    const row = sovFile.precincts[label]
    if (row) sumVotesByKey(sovAtWithheldRows, row.votes)
  }
  const residualFailures: string[] = []
  for (const key of new Set([...nbhdSums.keys(), ...sovSums.keys(), ...ourWithheld.keys()])) {
    const residual = (nbhdSums.get(key) ?? 0) - (sovSums.get(key) ?? 0)
    const ours = (ourWithheld.get(key) ?? 0) - (sovAtWithheldRows.get(key) ?? 0)
    if (key === WRITEIN_KEY) {
      // The write-in row is governed by the delta rule above; log its
      // residual for the record, never gate on it.
      console.error(`Gate B ${raceId}: write-in residual (nbhd − sov) = ${residual}, ours over withheld = ${ours}`)
      continue
    }
    if (residual !== ours) residualFailures.push(`${key}: nbhd − sov = ${residual}, ours over withheld = ${ours}`)
  }
  check(
    residualFailures.length === 0,
    `Gate B ${raceId}: residual does not close — ${residualFailures.join(' | ')}`,
  )
}

// ── Gate D: ballot conservation in every round ──────────────────────

function gateD(out: ReturnType<typeof tabulate>, totalBallots: number, raceId: string): void {
  const r1 = out.contest.rounds[0]
  check(
    totalBallots === r1.continuingTotal + r1.overvotes + r1.blanks,
    `Gate D ${raceId}: totalBallots ${totalBallots} != R1 continuing ${r1.continuingTotal} + overvotes ${r1.overvotes} + blanks ${r1.blanks}`,
  )
  for (const round of out.contest.rounds) {
    const sum = round.continuingTotal + round.exhausted + round.overvotes + round.blanks
    check(
      sum === totalBallots,
      `Gate D ${raceId}: round ${round.round} loses ballots — continuing+exhausted+overvotes+blanks = ${sum}, expected ${totalBallots}`,
    )
  }
}

// ── Main flow ───────────────────────────────────────────────────────

interface CliOptions {
  mode: 'write' | 'check' | 'self-test'
  dateCode: string
  race?: string
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: 'write', dateCode: '20241105' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') {
      check(opts.mode === 'write', '--check and --self-test are mutually exclusive')
      opts.mode = 'check'
    } else if (arg === '--self-test') {
      check(opts.mode === 'write', '--check and --self-test are mutually exclusive')
      opts.mode = 'self-test'
    } else if (arg === '--date') {
      const v = argv[++i]
      check(v && /^\d{8}$/.test(v), '--date expects a dateCode like 20241105')
      opts.dateCode = v
    } else if (arg === '--race') {
      const v = argv[++i]
      check(v, '--race expects a raceId')
      opts.race = v
    } else {
      throw new Error(`unknown argument: ${arg} (flags: --check | --self-test | --date <code> | --race <raceId>)`)
    }
  }
  return opts
}

interface RaceResult {
  acc: RaceAccumulator
  artifact: CVRBallotArtifact
  committed: RCVContest
  emitted: Buffer
}

function processRace(ctx: Context, acc: RaceAccumulator): RaceResult {
  const { raceId, raceKey } = acc.info
  try {
    const committed = JSON.parse(
      readFileSync(join(ctx.resultsDir, `rcv/${raceId}.json`), 'utf8'),
    ) as RCVContest
    const { artifact } = buildArtifact(ctx, acc, committed) // Gate C
    const out = gateA(artifact, committed, raceKey) // Gate A
    gateB(ctx, acc, artifact) // Gate B
    gateD(out, acc.ballots, raceId) // Gate D
    return { acc, artifact, committed, emitted: Buffer.from(JSON.stringify(artifact)) }
  } catch (err) {
    logOutstackHistogram(ctx, acc)
    throw err
  }
}

function blockedRaceIds(dateCode: string): string[] {
  return RECONCILIATION_BLOCKED.filter((k) => k.startsWith(`${dateCode}/`)).map((k) => k.slice(dateCode.length + 1))
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const ctx = loadContext(opts.dateCode)
  const blocked = blockedRaceIds(opts.dateCode)

  if (opts.race) {
    check(!blocked.includes(opts.race), `--race ${opts.race} is reconciliation-blocked (no certified rounds to gate against)`)
    check(ctx.races.some((r) => r.raceId === opts.race), `--race ${opts.race} is not an RCV contest in this CVR export`)
  }

  const accs = accumulate(ctx)
  const selfTestRace = opts.mode === 'self-test' ? opts.race ?? 'mayor' : undefined
  const targets = [...accs.values()]
    .filter((a) => !blocked.includes(a.info.raceId))
    .filter((a) => (selfTestRace ?? opts.race) === undefined || a.info.raceId === (selfTestRace ?? opts.race))
    .sort((a, b) => (a.info.raceId < b.info.raceId ? -1 : 1))
  check(targets.length > 0, 'no races selected')

  const results: RaceResult[] = []
  for (const acc of targets) {
    console.error(`gating ${acc.info.raceId}…`)
    results.push(processRace(ctx, acc))
  }

  const table = results.map((r) => ({
    race: r.acc.info.raceId,
    ballots: r.acc.ballots,
    patterns: r.artifact.patterns.length,
    groups: r.artifact.groups.length / 3,
    bytes: r.emitted.length,
    'gate A': 'PASS', 'gate B': 'PASS', 'gate C': 'PASS', 'gate D': 'PASS',
  }))
  for (const raceId of blocked) {
    const acc = accs.get(raceId)
    table.push({
      race: raceId, ballots: acc?.ballots ?? 0, patterns: acc?.citywidePatterns.size ?? 0,
      groups: NaN, bytes: NaN, 'gate A': 'BLOCKED', 'gate B': 'BLOCKED', 'gate C': 'BLOCKED', 'gate D': 'BLOCKED',
    })
  }

  if (opts.mode === 'self-test') {
    const target = results[0]
    const perturbed = JSON.parse(JSON.stringify(target.artifact)) as CVRBallotArtifact
    perturbed.groups[2] += 1
    let caught = false
    try {
      gateA(perturbed, target.committed, target.acc.info.raceKey)
    } catch {
      caught = true
    }
    check(caught, 'self-test did not catch perturbation')
    console.table(table)
    console.log(`self-test: Gate A caught a +1 perturbation of ${target.artifact.raceId} group 0 — reconciliation is live`)
    return
  }

  const manifest: CVRManifest = {
    dateCode: opts.dateCode,
    formatVersion: 1,
    races: Object.fromEntries(results.map((r) => [
      r.acc.info.raceId,
      { ballots: r.acc.ballots, patterns: r.artifact.patterns.length, groups: r.artifact.groups.length / 3, bytes: r.emitted.length },
    ])),
    reconciliationBlocked: blocked,
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest))
  const expectedFiles = [...results.map((r) => `${r.acc.info.raceId}.json`), '_manifest.json'].sort()

  if (opts.mode === 'check') {
    for (const r of results) {
      const path = join(ctx.cvrDir, `${r.acc.info.raceId}.json`)
      check(existsSync(path), `--check: committed artifact missing: ${path}`)
      check(readFileSync(path).equals(r.emitted), `--check: ${r.acc.info.raceId}.json differs from a fresh build`)
    }
    if (!opts.race) {
      const manifestPath = join(ctx.cvrDir, '_manifest.json')
      check(existsSync(manifestPath), `--check: committed manifest missing: ${manifestPath}`)
      check(readFileSync(manifestPath).equals(manifestBuf), '--check: _manifest.json differs from a fresh build')
      const onDisk = readdirSync(ctx.cvrDir).sort()
      check(
        JSON.stringify(onDisk) === JSON.stringify(expectedFiles),
        `--check: cvr/ contents differ — expected [${expectedFiles.join(', ')}], found [${onDisk.join(', ')}]`,
      )
    }
    console.table(table)
    console.log(`--check: ${results.length} committed CVR artifact(s)${opts.race ? '' : ' + _manifest.json'} byte-identical to a fresh build`)
    return
  }

  // write mode
  if (opts.race) {
    console.error(`--race ${opts.race}: writing only that artifact; _manifest.json untouched — run a full pass before committing`)
    mkdirSync(ctx.cvrDir, { recursive: true })
  } else {
    rmSync(ctx.cvrDir, { recursive: true, force: true })
    mkdirSync(ctx.cvrDir, { recursive: true })
  }
  for (const r of results) writeFileSync(join(ctx.cvrDir, `${r.acc.info.raceId}.json`), r.emitted)
  if (!opts.race) writeFileSync(join(ctx.cvrDir, '_manifest.json'), manifestBuf)
  console.table(table)
  console.log(`wrote ${results.length} artifact(s)${opts.race ? '' : ' + _manifest.json'} to ${ctx.cvrDir}`)
}

// CLI entry guard — module scope must stay side-effect-free (the
// reconciliation test imports the frozen constants from this file).
const isCliEntry = (() => {
  if (!process.argv[1]) return false
  try {
    return pathToFileURL(process.argv[1]).href === import.meta.url
  } catch {
    return false
  }
})()
if (isCliEntry) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
