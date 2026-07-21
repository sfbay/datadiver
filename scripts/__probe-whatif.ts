// TEMPORARY controller probe for PR 3 WHAT-IF — deleted before the branch merges.
// Implements the candidate tabulateWhatIf (catch-loop + deterministic tie ladder)
// and pins every number the plan's tests will assert, against the real committed
// ballots. Run: npx tsx scripts/__probe-whatif.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CVRBallotArtifact, CVRManifest, RCVContest } from '../src/types/elections'
import { decodeBallots, type DecodedBallots } from '../src/lib/rcv/ballots'
import {
  ASSIGN_BLANK, ASSIGN_EXHAUSTED, ASSIGN_OVERVOTED,
  RCVTieError, tabulate,
  type RoundAssignment, type TabulationOutput,
} from '../src/lib/rcv/tabulate'

const base = join(process.cwd(), 'public/data/elections/results/20241105')
const manifest = JSON.parse(readFileSync(join(base, 'cvr/_manifest.json'), 'utf8')) as CVRManifest
const raceIds = Object.keys(manifest.races)

type Meta = { raceId: string; title: string; candidates: string[]; precincts: string[] }

interface WhatIfResult {
  contest: RCVContest
  assignments: RoundAssignment[]
  finalByPrecinct: { leader: number }[]
  changedPrecincts: string[]
  winnerChanged: boolean
  tiesBroken: { round: number; tied: string[] }[]
}

// Local single-round precinct-state helper (mirror of replay.ts computeReplayRounds
// inner loop — replay.ts imports '@/types' so it can't load under bare tsx).
function roundLeaders(ballots: DecodedBallots, ra: RoundAssignment): { leader: number }[] {
  const tallies = Array.from({ length: ballots.precinctCount }, () => new Int32Array(ballots.candidateCount))
  for (let g = 0; g < ballots.groupCount.length; g++) {
    const a = ra.groups[g]
    if (a >= 0) tallies[ballots.groupPrecinct[g]][a] += ballots.groupCount[g]
  }
  return tallies.map((t) => {
    let max = 0, lead = -1
    for (let i = 0; i < t.length; i++) if (t[i] > max) { max = t[i]; lead = i }
    return { leader: lead }
  })
}

// ── Candidate implementation (the plan's reference) ─────────────────────────
function tabulateWhatIf(
  ballots: DecodedBallots,
  meta: Meta,
  struck: readonly number[],
  baseline: TabulationOutput,
): WhatIfResult {
  // Deterministic disclosed ladder (spec §3.5): eliminated earlier in the REAL
  // election goes first (finalists — absent from eliminationOrder — last, which
  // also encodes "a real-election finalist survives a non-finalist"); then
  // fewer certified R1 votes; then artifact order.
  const elimRank = new Map(baseline.eliminationOrder.map((name, i) => [name, i]))
  const r1Votes = new Map(baseline.contest.rounds[0].candidates.map((c) => [c.name, c.votes]))
  const ladderPick = (tiedIdx: number[]): number =>
    [...tiedIdx].sort((a, b) => {
      const ea = elimRank.get(meta.candidates[a]) ?? Infinity
      const eb = elimRank.get(meta.candidates[b]) ?? Infinity
      if (ea !== eb) return ea - eb
      const va = r1Votes.get(meta.candidates[a]) ?? 0
      const vb = r1Votes.get(meta.candidates[b]) ?? 0
      if (va !== vb) return va - vb
      return a - b
    })[0]

  const tiesBroken: { round: number; tied: string[] }[] = []
  const tieOrder: string[] = []
  let out: TabulationOutput
  for (;;) {
    try {
      out = tabulate(ballots, { raceId: meta.raceId, title: meta.title, candidates: meta.candidates }, { struck, tieOrder })
      break
    } catch (err) {
      if (!(err instanceof RCVTieError)) throw err
      const tiedIdx = err.tied.map((name) => meta.candidates.indexOf(name))
      tiesBroken.push({ round: err.round, tied: err.tied })
      tieOrder.push(meta.candidates[ladderPick(tiedIdx)])
    }
  }

  const baseFinal = roundLeaders(ballots, baseline.assignments[baseline.assignments.length - 1])
  const cfFinal = roundLeaders(ballots, out.assignments[out.assignments.length - 1])
  const changedPrecincts: string[] = []
  for (let p = 0; p < ballots.precinctCount; p++) {
    if (baseFinal[p].leader !== cfFinal[p].leader) changedPrecincts.push(meta.precincts[p])
  }
  return {
    contest: out.contest,
    assignments: out.assignments,
    finalByPrecinct: cfFinal,
    changedPrecincts,
    winnerChanged: out.contest.winner !== baseline.contest.winner,
    tiesBroken,
  }
}

// ── Load all races once ─────────────────────────────────────────────────────
const races = raceIds.map((raceId) => {
  const artifact = JSON.parse(readFileSync(join(base, `cvr/${raceId}.json`), 'utf8')) as CVRBallotArtifact
  const ballots = decodeBallots(artifact)
  const meta: Meta = { raceId, title: artifact.title, candidates: artifact.candidates, precincts: artifact.precincts }
  const baseline = tabulate(ballots, meta)
  return { raceId, artifact, ballots, meta, baseline }
})

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const conserve = (r: WhatIfResult | TabulationOutput, total: number) =>
  (('contest' in r ? r.contest : (r as never)) as RCVContest).rounds.every(
    (rd) => rd.continuingTotal + rd.exhausted + rd.overvotes + rd.blanks === total,
  )

console.log('races:', raceIds.join(', '))

// 1. Identity: struck=[] reproduces baseline contest exactly, all races.
for (const r of races) {
  const w = tabulateWhatIf(r.ballots, r.meta, [], r.baseline)
  if (!eq(w.contest, r.baseline.contest)) throw new Error(`${r.raceId}: struck=[] ≠ baseline`)
  if (w.winnerChanged || w.changedPrecincts.length !== 0 || w.tiesBroken.length !== 0)
    throw new Error(`${r.raceId}: struck=[] flags non-identity`)
}
console.log('1. identity struck=[] ≡ baseline: PASS ×', races.length)

// 2. Mayor: strike the winner (LURIE).
const mayor = races.find((r) => r.raceId === 'mayor')!
const li = (r: typeof mayor, name: string) => {
  const i = r.meta.candidates.findIndex((c) => c.includes(name))
  if (i < 0) throw new Error(`${name} not in ${r.raceId}`)
  return i
}
const t0 = performance.now()
const noLurie = tabulateWhatIf(mayor.ballots, mayor.meta, [li(mayor, 'LURIE')], mayor.baseline)
const t1 = performance.now()
console.log('2. mayor − LURIE:', JSON.stringify({
  winner: noLurie.contest.winner,
  winnerChanged: noLurie.winnerChanged,
  totalRounds: noLurie.contest.totalRounds,
  tiesBroken: noLurie.tiesBroken,
  changed: noLurie.changedPrecincts.length,
  r1exhausted: noLurie.contest.rounds[0].exhausted,
  finalRound: noLurie.contest.rounds[noLurie.contest.totalRounds - 1].candidates
    .filter((c) => c.votes > 0).map((c) => `${c.name} ${c.votes}`),
  conserved: conserve(noLurie, mayor.ballots.totalBallots),
  ms: Math.round(t1 - t0),
}))

// 3. Determinism: run twice → identical.
const noLurie2 = tabulateWhatIf(mayor.ballots, mayor.meta, [li(mayor, 'LURIE')], mayor.baseline)
console.log('3. determinism:', eq(noLurie.contest, noLurie2.contest) && eq(noLurie.changedPrecincts, noLurie2.changedPrecincts) ? 'PASS' : 'FAIL')

// 4. Mayor: strike the lowest-R1 candidate — winner must NOT change.
const mayorR1 = mayor.baseline.contest.rounds[0].candidates
const lowest = [...mayorR1].sort((a, b) => a.votes - b.votes)[0]
const noLowest = tabulateWhatIf(mayor.ballots, mayor.meta, [mayor.meta.candidates.indexOf(lowest.name)], mayor.baseline)
console.log('4. mayor −', lowest.name, `(R1 ${lowest.votes}):`, JSON.stringify({
  winner: noLowest.contest.winner, winnerChanged: noLowest.winnerChanged,
  totalRounds: noLowest.contest.totalRounds, changed: noLowest.changedPrecincts.length,
  tiesBroken: noLowest.tiesBroken.length,
}))

// 5. D11: strike the winner (CHEN).
const d11 = races.find((r) => r.raceId.includes('11'))!
const noChen = tabulateWhatIf(d11.ballots, d11.meta, [li(d11, 'CHEN')], d11.baseline)
console.log('5.', d11.raceId, '− CHEN:', JSON.stringify({
  winner: noChen.contest.winner, winnerChanged: noChen.winnerChanged,
  totalRounds: noChen.contest.totalRounds, changed: noChen.changedPrecincts.length,
  tiesBroken: noChen.tiesBroken, conserved: conserve(noChen, d11.ballots.totalBallots),
}))

// 6. Sweep: every single-candidate strike across all 10 races — tie census.
let singleRuns = 0, tieRuns = 0, totalTies = 0, flips = 0
const s0 = performance.now()
for (const r of races) {
  for (let i = 0; i < r.meta.candidates.length; i++) {
    const w = tabulateWhatIf(r.ballots, r.meta, [i], r.baseline)
    singleRuns++
    if (w.tiesBroken.length > 0) { tieRuns++; totalTies += w.tiesBroken.length }
    if (w.winnerChanged) { flips++; console.log(`   flip: ${r.raceId} − ${r.meta.candidates[i]} → ${w.contest.winner} (ties ${w.tiesBroken.length}, changed ${w.changedPrecincts.length})`) }
  }
}
const s1 = performance.now()
console.log('6. singles sweep:', JSON.stringify({ singleRuns, tieRuns, totalTies, flips, ms: Math.round(s1 - s0) }))

// 7. Mayor pairs sweep — deeper tie census.
let pairRuns = 0, pairTieRuns = 0, pairTies = 0
const p0 = performance.now()
for (let i = 0; i < mayor.meta.candidates.length; i++) {
  for (let j = i + 1; j < mayor.meta.candidates.length; j++) {
    const w = tabulateWhatIf(mayor.ballots, mayor.meta, [i, j], mayor.baseline)
    pairRuns++
    if (w.tiesBroken.length > 0) { pairTieRuns++; pairTies += w.tiesBroken.length }
  }
}
const p1 = performance.now()
console.log('7. mayor pairs sweep:', JSON.stringify({ pairRuns, pairTieRuns, pairTies, ms: Math.round(p1 - p0) }))

// 8. Strike-to-two: leave only the two mayor finalists.
const finalRound = mayor.baseline.contest.rounds[mayor.baseline.contest.totalRounds - 1]
const finalists = finalRound.candidates.filter((c) => c.votes > 0).map((c) => c.name)
const struckAll = mayor.meta.candidates.map((_, i) => i).filter((i) => !finalists.includes(mayor.meta.candidates[i]))
const twoLeft = tabulateWhatIf(mayor.ballots, mayor.meta, struckAll, mayor.baseline)
console.log('8. mayor strike-to-two:', JSON.stringify({
  struck: struckAll.length, totalRounds: twoLeft.contest.totalRounds,
  winner: twoLeft.contest.winner, winnerChanged: twoLeft.winnerChanged,
  r1: twoLeft.contest.rounds[0].candidates.filter((c) => c.votes > 0).map((c) => `${c.name} ${c.votes}`),
  r1exhausted: twoLeft.contest.rounds[0].exhausted,
  conserved: conserve(twoLeft, mayor.ballots.totalBallots),
}))

// 9. changedPrecincts ∩ sovSuppressed (does the view's painted-filter matter?)
const suppressedSet = new Set(mayor.artifact.sovSuppressed)
const changedSuppressed = noLurie.changedPrecincts.filter((p) => suppressedSet.has(p)).length
console.log('9. mayor −LURIE changed∩sovSuppressed:', changedSuppressed, 'of', noLurie.changedPrecincts.length)

// 10. tiesBroken example detail — first tie-bearing single strike, for copy QA.
outer: for (const r of races) {
  for (let i = 0; i < r.meta.candidates.length; i++) {
    const w = tabulateWhatIf(r.ballots, r.meta, [i], r.baseline)
    if (w.tiesBroken.length > 0) {
      console.log('10. example ties:', r.raceId, '−', r.meta.candidates[i], JSON.stringify(w.tiesBroken))
      break outer
    }
  }
}
console.log('probe complete')

// 11. Locate the single tying mayor pair + its full detail.
for (let i = 0; i < mayor.meta.candidates.length; i++) {
  for (let j = i + 1; j < mayor.meta.candidates.length; j++) {
    const w = tabulateWhatIf(mayor.ballots, mayor.meta, [i, j], mayor.baseline)
    if (w.tiesBroken.length > 0) {
      console.log('11. tie pair:', JSON.stringify({
        struck: [mayor.meta.candidates[i], mayor.meta.candidates[j]],
        struckIdx: [i, j],
        tiesBroken: w.tiesBroken,
        winner: w.contest.winner, winnerChanged: w.winnerChanged,
        totalRounds: w.contest.totalRounds, changed: w.changedPrecincts.length,
      }))
      // ladder verification: who did the ladder eliminate at that round?
      const tb = w.tiesBroken[0]
      const rd = w.contest.rounds[tb.round - 1]
      console.log('    eliminated that round:', rd.candidates.find((c) => c.isEliminated)?.name,
        '| certified elim order:', JSON.stringify(mayor.baseline.eliminationOrder.filter((n) => tb.tied.includes(n))),
        '| certified R1 of tied:', JSON.stringify(tb.tied.map((n) => `${n}:${mayor.baseline.contest.rounds[0].candidates.find((c) => c.name === n)?.votes}`)))
    }
  }
}
console.log('12. mayor candidates in artifact order:', JSON.stringify(mayor.meta.candidates))
console.log('13. D11 candidates:', JSON.stringify(d11.meta.candidates))
