/**
 * build-cvr-ballots.ts
 *
 * Generator for the CVR-powered RCV replay skin — parsing core.
 *
 * This file holds ONLY the exported pure helpers + the zip walker. Task 7
 * appends the main flow (manifest loading, per-race accumulation, artifact
 * writing) — keep helpers exported at top level and free of module-scope
 * side effects so that flow can be added without restructuring this file.
 *
 * Zip walk + mark-resolution rules are ported from the Task-0 probe
 * (`probe-cvr.mjs`), which reproduced SF's certified Nov 2024 CVR numbers
 * exactly (blanks 18,540; overvotes 1,381; effective first choices exact
 * across all 10 RCV races) — see docs/superpowers/specs and the task-6
 * brief for the Charter §13.102 rules this implements. Zip format precedent:
 * `build-election-results.mjs` (`unzipXlsx`, lines ~29-46).
 *
 * Run (once Task 7 lands the main flow): `npx tsx scripts/build-cvr-ballots.ts`
 */

import { inflateRawSync } from 'node:zlib'

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
